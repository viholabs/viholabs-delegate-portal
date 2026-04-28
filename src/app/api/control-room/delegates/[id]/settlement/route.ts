// src/app/api/control-room/delegates/[id]/settlement/route.ts
// POST /api/control-room/delegates/[id]/settlement
// Genera una propuesta formal de liquidación para el periodo indicado.
// Solo Melquisedec puede crear propuestas.

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: delegateId } = await ctx.params;

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean;
      status?: number;
      error?: string;
      actor?: unknown;
    };

    if (!auth?.ok) {
      return json(auth?.status ?? 401, { ok: false, error: auth?.error ?? "Unauthorized" });
    }

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) return json(401, { ok: false, error: "Actor not resolved" });

    const role = normalizeRole(requestingActor.role);
    if (role !== "MELQUISEDEC") {
      return json(403, { ok: false, error: "Solo Melquisedec puede generar propuestas de liquidación" });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const month = asString(body?.month);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return json(400, { ok: false, error: "month requerido (YYYY-MM)" });
    }

    const bounds = getMonthBounds(month);
    const today = todayYmdUtc();
    const db = supabaseAdmin();

    // Buscar si ya existe una propuesta OPEN para este periodo
    const { data: existing } = await db
      .from("commission_settlement_proposals")
      .select("id, status")
      .eq("actor_id", delegateId)
      .eq("period_yyyy_mm", month)
      .eq("state_code", "OPEN")
      .maybeSingle();

    if (existing) {
      return json(409, {
        ok: false,
        error: `Ya existe una propuesta para ${month} con estado "${existing.status}". Elimínala antes de generar una nueva.`,
      });
    }

    // Obtener asignaciones → client_holded_contact_ids
    const { data: assignmentsData, error: assErr } = await db
      .from("client_actor_assignments_g1")
      .select("client_holded_contact_id")
      .eq("actor_id", delegateId)
      .eq("assignment_role", "delegate")
      .is("valid_to", null);

    if (assErr) return json(500, { ok: false, error: assErr.message });

    const holdedIds = [...new Set(
      (assignmentsData ?? [])
        .map((r) => asString((r as Record<string, unknown>).client_holded_contact_id))
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    )];

    let clientIds: string[] = [];
    if (holdedIds.length > 0) {
      const { data: clientsData } = await db
        .from("clients")
        .select("id")
        .in("holded_contact_id", holdedIds)
        .in("state_code", ["OPEN", "ACTIVE"]);
      clientIds = (clientsData ?? []).map((r) => asString((r as Record<string, unknown>).id)).filter((v): v is string => !!v);
    }

    if (clientIds.length === 0) {
      return json(422, { ok: false, error: "El delegado no tiene clientes asignados activos" });
    }

    // Facturas cobradas en el periodo (solo tipo invoice — CNs excluidos explícitamente)
    const { data: paidInvoices, error: invErr } = await db
      .from("invoices")
      .select("id, total_net, total_gross, is_paid, invoice_date")
      .in("client_id", clientIds)
      .eq("is_paid", true)
      .eq("document_type", "invoice")
      .not("paid_date", "is", null)
      .gte("paid_date", bounds.start)
      .lt("paid_date", bounds.endExclusive);

    if (invErr) return json(500, { ok: false, error: invErr.message });

    const invoiceIds = (paidInvoices ?? []).map((r) => asString((r as Record<string, unknown>).id)).filter((v): v is string => !!v);

    // CNs emitidas en el periodo (aplican neteo sobre unidades e importe comisionable)
    const { data: cnData } = await db
      .from("invoices")
      .select("id")
      .in("client_id", clientIds)
      .eq("document_type", "creditnote")
      .gte("invoice_date", bounds.start)
      .lt("invoice_date", bounds.endExclusive);

    const cnInvoiceIds = (cnData ?? [])
      .map((r) => asString((r as Record<string, unknown>).id))
      .filter((v): v is string => !!v);

    // Items de facturas cobradas + items de CNs del periodo
    let totalUnitsSoldPaid = 0;
    let totalUnitsFoc = 0;
    let totalNetCommissionable = 0;

    const allItemInvoiceIds = [...invoiceIds, ...cnInvoiceIds];

    if (allItemInvoiceIds.length > 0) {
      // Fetch invoice items first so we can filter normalizations by item ID
      const itemsRes = await db
        .from("invoice_items")
        .select("id, invoice_id, units, line_net_amount, line_type")
        .in("invoice_id", allItemInvoiceIds)
        .eq("state_code", "OPEN");

      const itemIds = (itemsRes.data ?? [])
        .map((r) => asString((r as Record<string, unknown>).id))
        .filter((v): v is string => !!v);

      const normMap = new Map<string, { line_type: string; is_commissionable: boolean }>();
      if (itemIds.length > 0) {
        const normRes = await db
          .from("invoice_line_normalizations")
          .select("raw_invoice_item_id, line_type, is_commissionable")
          .in("raw_invoice_item_id", itemIds)
          .eq("state_code", "OPEN");

        for (const rec of normRes.data ?? []) {
          const r = rec as Record<string, unknown>;
          const id = asString(r.raw_invoice_item_id);
          if (id) normMap.set(id, { line_type: asString(r.line_type) ?? "", is_commissionable: r.is_commissionable === true });
        }
      }

      const cnInvoiceIdSet = new Set(cnInvoiceIds);

      for (const rec of itemsRes.data ?? []) {
        const r = rec as Record<string, unknown>;
        const itemId = asString(r.id) ?? "";
        const invoiceId = asString(r.invoice_id) ?? "";
        const isCn = cnInvoiceIdSet.has(invoiceId);
        const norm = normMap.get(itemId);
        const lineType = (norm?.line_type ?? asString(r.line_type) ?? "").toLowerCase();
        const units = asNumber(r.units) ?? 0;
        const lineNet = asNumber(r.line_net_amount) ?? 0;

        // Promo/FOC lines are explicitly classified — everything else is a sale by default
        const isPromo = lineType === "promo" || lineType === "promotion" || lineType === "foc";
        const isSale = !isPromo && (lineType === "sale" || lineType === "product" || lineType === "");

        if (isSale) {
          // CNs restan unidades e importe (sus line_net_amount son negativos)
          if (isCn) {
            totalUnitsSoldPaid -= units;
            totalNetCommissionable += lineNet; // lineNet < 0 para CNs → resta
          } else {
            totalUnitsSoldPaid += units;
            if (norm?.is_commissionable) totalNetCommissionable += lineNet;
          }
        } else if (isPromo) {
          if (isCn) {
            totalUnitsFoc -= units;
          } else {
            totalUnitsFoc += units;
          }
        }
      }
    }

    // Asegurar que los totales no sean negativos (caso extremo: más CNs que ventas)
    totalUnitsSoldPaid = Math.max(0, totalUnitsSoldPaid);
    totalUnitsFoc = Math.max(0, totalUnitsFoc);

    // Aproximar base comisionable si no hay normalizaciones (usar unidades netas × 31 €)
    if (totalNetCommissionable === 0 && totalUnitsSoldPaid > 0) {
      totalNetCommissionable = totalUnitsSoldPaid * 31;
    }

    // Obtener regla de comisión aplicable
    const { data: rulesData } = await db
      .from("commission_rules_delegates")
      .select("from_units, to_units, percentage, reference_price, delegate_id, channel")
      .or(`delegate_id.eq.${delegateId},delegate_id.is.null`)
      .eq("active", true)
      .order("from_units", { ascending: true });

    const rules = (rulesData ?? []) as Array<Record<string, unknown>>;
    const pdvRules = rules
      .sort((a, b) => {
        if (a.delegate_id && !b.delegate_id) return -1;
        if (!a.delegate_id && b.delegate_id) return 1;
        return (asNumber(a.from_units) ?? 0) - (asNumber(b.from_units) ?? 0);
      })
      .filter((r) => (asString(r.channel) ?? "").toLowerCase() === "pdv");

    // Fallback to FIRST (lowest) tier when units don't match any bracket.
    // pdvRules is sorted ascending by from_units so pdvRules[0] is always the minimum tier.
    const applicable = pdvRules.find((r) =>
      totalUnitsSoldPaid >= (asNumber(r.from_units) ?? 0) &&
      totalUnitsSoldPaid <= (asNumber(r.to_units) ?? 0)
    ) ?? pdvRules[0] ?? null;

    const pct = applicable ? (asNumber(applicable.percentage) ?? 0) : 0;
    const refPrice = applicable ? (asNumber(applicable.reference_price) ?? 31) : 31;
    const totalCommissionAmount = totalUnitsSoldPaid * refPrice * (pct / 100);

    // Calcular comisiones de recomendadores a deducir
    let totalRecommenderCommissions = 0;
    {
      const { data: recommenders } = await db
        .from("recommenders")
        .select("id, commission_pct")
        .eq("delegate_actor_id", delegateId)
        .eq("state_code", "OPEN")
        .eq("active", true);

      const recommenderIds = (recommenders ?? [])
        .map((r) => asString((r as Record<string, unknown>).id))
        .filter((v): v is string => !!v);

      if (recommenderIds.length > 0) {
        const { data: rcaRows } = await db
          .from("recommender_client_assignments")
          .select("recommender_id, client_id, commission_pct")
          .in("recommender_id", recommenderIds)
          .eq("state_code", "OPEN");

        // Build map: recommender_id → commission_pct
        const recPctMap = new Map<string, number>();
        for (const r of recommenders ?? []) {
          const row = r as Record<string, unknown>;
          const id = asString(row.id);
          if (id) recPctMap.set(id, asNumber(row.commission_pct) ?? 0);
        }

        // Gather all client IDs from assignments
        const rcaClientIds = [...new Set(
          (rcaRows ?? []).map((r) => asString((r as Record<string, unknown>).client_id)).filter((v): v is string => !!v)
        )];

        if (rcaClientIds.length > 0) {
          const { data: recPaidInvoices } = await db
            .from("invoices")
            .select("id, client_id, total_net")
            .in("client_id", rcaClientIds)
            .eq("is_paid", true)
            .eq("document_type", "invoice")
            .not("paid_date", "is", null)
            .gte("paid_date", bounds.start)
            .lt("paid_date", bounds.endExclusive);

          // Sum net per client
          const netByClient = new Map<string, number>();
          for (const inv of recPaidInvoices ?? []) {
            const r = inv as Record<string, unknown>;
            const cid = asString(r.client_id) ?? "";
            netByClient.set(cid, (netByClient.get(cid) ?? 0) + (asNumber(r.total_net) ?? 0));
          }

          // For each assignment, compute recommender commission
          for (const row of rcaRows ?? []) {
            const r = row as Record<string, unknown>;
            const rid = asString(r.recommender_id) ?? "";
            const cid = asString(r.client_id) ?? "";
            const effectivePct = asNumber(r.commission_pct) ?? recPctMap.get(rid) ?? 0;
            const clientNet = netByClient.get(cid) ?? 0;
            totalRecommenderCommissions += clientNet * (effectivePct / 100);
          }
        }
      }
    }

    const totalPayable = Math.max(0, totalCommissionAmount - totalRecommenderCommissions);

    // Crear propuesta
    const { data: newProposal, error: insertErr } = await db
      .from("commission_settlement_proposals")
      .insert({
        actor_id: delegateId,
        period_yyyy_mm: month,
        role: "delegate",           // commission_role enum: 'delegate' | 'coord_commercial' | ...
        status: "DRAFT",
        state_code: "OPEN",
        total_units_sold_paid: totalUnitsSoldPaid,
        total_units_foc: totalUnitsFoc,
        total_net_commissionable: totalNetCommissionable,
        total_commission_amount: totalCommissionAmount,
        total_adjustments_amount: 0,
        total_recommender_commissions_amount: totalRecommenderCommissions,
        total_payable_amount: totalPayable,
        data_cutoff_at: new Date().toISOString(),
        ruleset_version: `auto-${today}`,
      })
      .select()
      .single();

    if (insertErr) return json(500, { ok: false, error: insertErr.message });

    return json(201, { ok: true, proposal: newProposal });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}

// ---------------------------------------------------------------------------
// DELETE — elimina la propuesta DRAFT del periodo (solo Melquisedec)
// ---------------------------------------------------------------------------

export async function DELETE(
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

    if (normalizeRole(requestingActor.role) !== "MELQUISEDEC") {
      return json(403, { ok: false, error: "Solo Melquisedec puede eliminar propuestas de liquidación" });
    }

    const url = new URL(req.url);
    const month = asString(url.searchParams.get("month"));
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return json(400, { ok: false, error: "month requerido (YYYY-MM)" });
    }

    const db = supabaseAdmin();

    // Solo se puede eliminar si está en estado DRAFT
    const { data: existing } = await db
      .from("commission_settlement_proposals")
      .select("id, status")
      .eq("actor_id", delegateId)
      .eq("period_yyyy_mm", month)
      .eq("state_code", "OPEN")
      .maybeSingle();

    if (!existing) {
      return json(404, { ok: false, error: "No existe propuesta para este periodo" });
    }

    const existingRow = existing as Record<string, unknown>;
    if (asString(existingRow.status) !== "DRAFT") {
      return json(409, { ok: false, error: "Solo se pueden eliminar propuestas en estado DRAFT" });
    }

    const { error: delErr } = await db
      .from("commission_settlement_proposals")
      .delete()
      .eq("id", asString(existingRow.id));

    if (delErr) return json(500, { ok: false, error: delErr.message });

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}
