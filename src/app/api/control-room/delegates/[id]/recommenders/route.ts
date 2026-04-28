// GET  /api/control-room/delegates/[id]/recommenders?month=YYYY-MM
//   → lista recomendadores del delegado con comisiones calculadas para el periodo
// POST /api/control-room/delegates/[id]/recommenders
//   → crea un nuevo recomendador (Melquisedec/supervisores)

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeRole } from "@/lib/auth/roles";
import { asString, asNumber, todayYmdUtc } from "@/lib/holded/holdedPrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function toActorLike(record: unknown) {
  const row = record as Record<string, unknown> | null | undefined;
  const id = asString(row?.id);
  if (!id) return null;
  return { id, role: asString(row?.role) };
}

function isSupervisor(role: string) {
  return ["MELQUISEDEC", "SUPER_ADMIN", "ADMINISTRATIVE", "COORDINATOR_COMMERCIAL", "COORDINATOR_CECT", "KOL"].includes(role);
}

function getMonthBounds(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: end.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// GET — list recommenders with period commission summary
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: delegateId } = await ctx.params;

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean; status?: number; error?: string; actor?: unknown;
    };
    if (!auth?.ok) return json(auth?.status ?? 401, { ok: false, error: auth?.error ?? "Unauthorized" });

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) return json(401, { ok: false, error: "Actor not resolved" });

    const role = normalizeRole(requestingActor.role);
    const eff = await getEffectivePermissionsByActorId(requestingActor.id);
    const canViewGlobal = eff.isSuperAdmin || eff.has("control_room.read") || eff.has("actors.read");
    const isDelegate = role === "DELEGATE";

    // Delegates can only see their own recommenders
    if (isDelegate && !canViewGlobal && requestingActor.id !== delegateId) {
      return json(403, { ok: false, error: "Forbidden" });
    }

    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? todayYmdUtc().slice(0, 7);
    const bounds = getMonthBounds(month);

    const db = supabaseAdmin();

    // 1. Fetch recommenders for this delegate
    const { data: recommenders, error: recErr } = await db
      .from("recommenders")
      .select("id, name, email, phone, commission_pct, notes, active, client_id, created_at")
      .eq("delegate_actor_id", delegateId)
      .eq("state_code", "OPEN")
      .order("name", { ascending: true });

    if (recErr) return json(500, { ok: false, error: recErr.message });

    if (!recommenders || recommenders.length === 0) {
      return json(200, { ok: true, recommenders: [], period: { month, total_commission: 0 } });
    }

    const recommenderIds = recommenders.map((r) => asString((r as Record<string, unknown>).id)).filter((v): v is string => !!v);

    // 2. Fetch client assignments for all recommenders
    const { data: assignments } = await db
      .from("recommender_client_assignments")
      .select("id, recommender_id, client_id, commission_pct, valid_from, valid_to")
      .in("recommender_id", recommenderIds)
      .eq("state_code", "OPEN");

    const assignmentsByRecommender = new Map<string, Array<{ client_id: string; commission_pct: number | null }>>();
    for (const rec of recommenders) {
      const r = rec as Record<string, unknown>;
      assignmentsByRecommender.set(asString(r.id) ?? "", []);
    }
    for (const row of assignments ?? []) {
      const r = row as Record<string, unknown>;
      const rid = asString(r.recommender_id) ?? "";
      const cid = asString(r.client_id);
      if (!cid) continue;
      const validFrom = asString(r.valid_from);
      const validTo = asString(r.valid_to);
      // Skip assignments not yet active or already expired
      const today = todayYmdUtc();
      if (validFrom && validFrom > today) continue;
      if (validTo && validTo < bounds.start) continue;
      const existing = assignmentsByRecommender.get(rid) ?? [];
      existing.push({ client_id: cid, commission_pct: asNumber(r.commission_pct) ?? null });
      assignmentsByRecommender.set(rid, existing);
    }

    // 3. Gather all assigned client IDs
    const allClientIds = [...new Set(
      [...assignmentsByRecommender.values()].flat().map((a) => a.client_id)
    )];

    // 4. Fetch paid invoices in period for those clients
    let invoicesByClient = new Map<string, { net_commissionable: number; total_gross: number; invoice_count: number }>();

    if (allClientIds.length > 0) {
      const { data: paidInvoices } = await db
        .from("invoices")
        .select("id, client_id, total_net, total_gross, is_paid, paid_date")
        .in("client_id", allClientIds)
        .eq("is_paid", true)
        .eq("document_type", "invoice")
        .not("paid_date", "is", null)
        .gte("paid_date", bounds.start)
        .lt("paid_date", bounds.endExclusive);

      const invoiceIds = (paidInvoices ?? []).map((r) => asString((r as Record<string, unknown>).id)).filter((v): v is string => !!v);

      // Compute net_commissionable per invoice from items
      const invNetMap = new Map<string, number>();
      if (invoiceIds.length > 0) {
        const { data: itemsData } = await db
          .from("invoice_items")
          .select("id, invoice_id, units, line_net_amount, line_type")
          .in("invoice_id", invoiceIds)
          .eq("state_code", "OPEN");

        const itemIds = (itemsData ?? []).map((r) => asString((r as Record<string, unknown>).id)).filter((v): v is string => !!v);
        const normMap = new Map<string, { is_commissionable: boolean }>();

        if (itemIds.length > 0) {
          const { data: normData } = await db
            .from("invoice_line_normalizations")
            .select("raw_invoice_item_id, is_commissionable")
            .in("raw_invoice_item_id", itemIds)
            .eq("state_code", "OPEN");

          for (const rec of normData ?? []) {
            const r = rec as Record<string, unknown>;
            const id = asString(r.raw_invoice_item_id);
            if (id) normMap.set(id, { is_commissionable: r.is_commissionable === true });
          }
        }

        for (const rec of itemsData ?? []) {
          const r = rec as Record<string, unknown>;
          const itemId = asString(r.id) ?? "";
          const invoiceId = asString(r.invoice_id) ?? "";
          const norm = normMap.get(itemId);
          const lineType = (asString(r.line_type) ?? "").toLowerCase();
          const lineNet = asNumber(r.line_net_amount) ?? 0;
          const isPromo = lineType === "promo" || lineType === "promotion" || lineType === "foc";
          const isSale = !isPromo;

          if (isSale && (norm?.is_commissionable ?? true)) {
            invNetMap.set(invoiceId, (invNetMap.get(invoiceId) ?? 0) + lineNet);
          }
        }
      }

      for (const inv of paidInvoices ?? []) {
        const r = inv as Record<string, unknown>;
        const clientId = asString(r.client_id) ?? "";
        const invId = asString(r.id) ?? "";
        const netCommissionable = invNetMap.get(invId) ?? (asNumber(r.total_net) ?? 0);
        const totalGross = asNumber(r.total_gross) ?? 0;

        const existing = invoicesByClient.get(clientId) ?? { net_commissionable: 0, total_gross: 0, invoice_count: 0 };
        invoicesByClient.set(clientId, {
          net_commissionable: existing.net_commissionable + netCommissionable,
          total_gross: existing.total_gross + totalGross,
          invoice_count: existing.invoice_count + 1,
        });
      }
    }

    // 5. Build result rows
    let totalPeriodCommission = 0;

    const result = recommenders.map((rec) => {
      const r = rec as Record<string, unknown>;
      const rid = asString(r.id) ?? "";
      const defaultPct = asNumber(r.commission_pct) ?? 0;
      const clientAssignments = assignmentsByRecommender.get(rid) ?? [];

      let assignedNetCommissionable = 0;
      let assignedTotalGross = 0;
      let assignedInvoiceCount = 0;

      for (const { client_id, commission_pct } of clientAssignments) {
        const data = invoicesByClient.get(client_id);
        if (data) {
          assignedNetCommissionable += data.net_commissionable;
          assignedTotalGross += data.total_gross;
          assignedInvoiceCount += data.invoice_count;
        }
      }

      const effectivePct = defaultPct;
      const commissionAmount = assignedNetCommissionable * (effectivePct / 100);
      totalPeriodCommission += commissionAmount;

      return {
        id: rid,
        name: asString(r.name),
        email: asString(r.email),
        phone: asString(r.phone),
        commission_pct: defaultPct,
        notes: asString(r.notes),
        active: r.active === true,
        client_id: asString(r.client_id),
        created_at: asString(r.created_at),
        clients_assigned: clientAssignments.length,
        period: {
          net_commissionable: assignedNetCommissionable,
          total_gross: assignedTotalGross,
          invoice_count: assignedInvoiceCount,
          commission_amount: commissionAmount,
        },
      };
    });

    return json(200, {
      ok: true,
      recommenders: result,
      period: {
        month,
        total_commission: totalPeriodCommission,
      },
    });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}

// ---------------------------------------------------------------------------
// POST — create recommender (supervisors only)
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: delegateId } = await ctx.params;

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean; status?: number; error?: string; actor?: unknown;
    };
    if (!auth?.ok) return json(auth?.status ?? 401, { ok: false, error: auth?.error ?? "Unauthorized" });

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) return json(401, { ok: false, error: "Actor not resolved" });

    const role = normalizeRole(requestingActor.role);
    if (!isSupervisor(role)) {
      return json(403, { ok: false, error: "Solo supervisores pueden gestionar recomendadores" });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const name = asString(body?.name)?.trim();
    if (!name) return json(400, { ok: false, error: "name requerido" });

    const commissionPct = asNumber(body?.commission_pct);
    if (commissionPct === null || commissionPct < 0 || commissionPct > 100) {
      return json(400, { ok: false, error: "commission_pct debe ser entre 0 y 100" });
    }

    const db = supabaseAdmin();

    // Verify delegate exists
    const { data: delegate } = await db
      .from("actors")
      .select("id")
      .eq("id", delegateId)
      .eq("role", "delegate")
      .maybeSingle();

    if (!delegate) return json(404, { ok: false, error: "Delegado no encontrado" });

    const { data: newRec, error: insertErr } = await db
      .from("recommenders")
      .insert({
        delegate_actor_id: delegateId,
        name,
        email: asString(body?.email)?.trim() || null,
        phone: asString(body?.phone)?.trim() || null,
        commission_pct: commissionPct,
        notes: asString(body?.notes)?.trim() || null,
        client_id: asString(body?.client_id) || null,
        active: body?.active !== false,
        state_code: "OPEN",
      })
      .select()
      .single();

    if (insertErr) return json(500, { ok: false, error: insertErr.message });

    return json(201, { ok: true, recommender: newRec });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}
