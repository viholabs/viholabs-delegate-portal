// src/app/api/control-room/invoices/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

type RpcPermRow = { perm_code: string | null };

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

// UI te puede pasar "YYYY-MM-01" (input month) -> lo convertimos a "YYYY-MM"
function toMonthStringFromDateYYYYMM01(value: string) {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-01$/);
  if (m) return `${m[1]}-${m[2]}`;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return "";
}

// ✅ boolean estricto (evita bug: "false" -> true)
function parseBoolStrict(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return undefined;
}

function normalizePermCode(v: any) {
  return String(v ?? "").trim();
}

async function getPermsOrThrow(supaService: any, actorId: string) {
  const { data, error } = await supaService.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  if (error) throw new Error(`effective_permissions failed: ${error.message}`);

  const rows = (data ?? []) as RpcPermRow[];
  const codes = rows
    .map((r) => normalizePermCode(r?.perm_code))
    .filter((x) => x.length > 0);

  const isSuperAdmin = codes.includes("*");
  const perms = new Set<string>(codes);

  return {
    isSuperAdmin,
    has: (perm: string) => (isSuperAdmin ? true : perms.has(perm)),
  };
}

function parseBool01(v: string | null): boolean {
  return v === "1" || (v ?? "").toLowerCase() === "true";
}

export async function GET(req: Request) {
  let stage = "init";

  try {
    // 1) Actor + supabase clients (service + RLS)
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaService, supaRls } = ar as {
      actor: { id: string };
      supaService: any; // service role
      supaRls: any; // RLS client
    };

    // 2) Permisos efectivos + autorización
    stage = "effective_permissions";
    const perms = await getPermsOrThrow(supaService, actor.id);

    stage = "authorize";
    if (!perms.has("invoices.read")) {
      return json(403, { ok: false, stage, error: "No autorizado (invoices.read)" });
    }

    // 3) Params
    stage = "parse_params";
    const url = new URL(req.url);
    const monthParam = url.searchParams.get("month") || "";
    const q = (url.searchParams.get("q") || "").trim();

    // Sidebar badge usa esto:
    const countOnly = parseBool01(url.searchParams.get("count_only"));
    const needsReview = parseBool01(url.searchParams.get("needs_review"));

    const month = toMonthStringFromDateYYYYMM01(monthParam);
    if (!month) {
      return json(400, {
        ok: false,
        stage,
        error: "Invalid month. Expected YYYY-MM-01 or YYYY-MM",
        received: monthParam,
      });
    }

    // ✅ CLIENT A USAR:
    // - SUPER_ADMIN -> service (bypass RLS) para evitar recursividad (stack depth)
    // - Otros -> RLS normal
    const db = perms.isSuperAdmin ? supaService : supaRls;

    // 4) COUNT ONLY (para Sidebar / badges) -> query mínima SIN joins
    if (countOnly) {
      stage = "select_invoices_count";

      let cq = db
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("source_month", month);

      if (needsReview) cq = cq.eq("needs_review", true);

      const { count, error } = await cq;
      if (error) return json(500, { ok: false, stage, error: error.message });

      return json(200, {
        ok: true,
        month,
        q: "",
        count_only: true,
        needs_review: needsReview,
        count: Number(count ?? 0),
      });
    }

    // 5) LISTA (pantalla / tabla) -> mantiene tu select original
    stage = "select_invoices";
    let query = db
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        invoice_date,
        source_month,
        is_paid,
        paid_date,
        source_channel,
        needs_review,
        total_net,
        total_gross,
        client_id,
        client_name,
        client_name_raw,
        delegate_id,
        created_at,
        updated_at,
        clients:client_id (
          id,
          name,
          tax_id,
          delegate_id
        )
      `
      )
      .eq("source_month", month)
      .order("invoice_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (needsReview) {
      query = query.eq("needs_review", true);
    }

    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `invoice_number.ilike.${like},client_name.ilike.${like},client_name_raw.ilike.${like}`
      );
    }

    const { data: invoices, error } = await query;
    if (error) return json(500, { ok: false, stage, error: error.message });

    const rows = invoices || [];

    const total = rows.length;
    const paid = rows.filter((r: any) => r.is_paid === true).length;
    const unpaid = total - paid;

    const total_gross_sum = rows.reduce((acc: number, r: any) => {
      const v = Number(r.total_gross ?? 0);
      return Number.isFinite(v) ? acc + v : acc;
    }, 0);

    return json(200, {
      ok: true,
      month,
      q,
      kpis: {
        total_invoices: total,
        paid,
        unpaid,
        total_gross_sum: Math.round(total_gross_sum * 100) / 100,
      },
      invoices: rows,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message || String(e) });
  }
}

export async function PATCH(req: Request) {
  let stage = "init";

  try {
    // 1) Actor + supabase clients (service + RLS)
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaService, supaRls } = ar as {
      actor: { id: string };
      supaService: any;
      supaRls: any;
    };

    // 2) Permisos efectivos + autorización
    stage = "effective_permissions";
    const perms = await getPermsOrThrow(supaService, actor.id);

    stage = "authorize";
    if (!perms.has("invoices.manage")) {
      return json(403, { ok: false, stage, error: "No autorizado (invoices.manage)" });
    }

    // 3) Body
    stage = "parse_body";
    const body = await req.json().catch(() => null);

    const invoice_id = safeStr(body?.invoice_id);
    const isPaidParsed = parseBoolStrict(body?.is_paid); // ✅ NO usar !!
    const source_channel = safeStr(body?.source_channel || "unknown") || "unknown";
    const delegate_id = body?.delegate_id ? safeStr(body.delegate_id) : null; // delegates.id
    const apply_delegate_to_client = !!body?.apply_delegate_to_client;

    if (!invoice_id) return json(400, { ok: false, stage, error: "Missing invoice_id" });

    // 4) Cargar factura (con RLS)
    stage = "load_invoice";
    const { data: inv, error: invErr } = await supaRls
      .from("invoices")
      .select("id, client_id")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invErr) return json(500, { ok: false, stage, error: invErr.message });
    if (!inv) return json(404, { ok: false, stage, error: "Invoice not found" });

    const client_id = inv.client_id ? String(inv.client_id) : null;

    // 5) Validar delegate_id (si viene informado)
    //    Usamos service para validar existencia global sin depender de RLS.
    stage = "validate_delegate";
    if (delegate_id) {
      const { data: drow, error: derr } = await supaService
        .from("delegates")
        .select("id")
        .eq("id", delegate_id)
        .maybeSingle();

      if (derr) return json(500, { ok: false, stage, error: derr.message });
      if (!drow) return json(400, { ok: false, stage, error: "delegate_id not found in delegates" });
    }

    // 6) Preparar patch invoice
    stage = "update_invoice";
    const patch: any = {
      source_channel,
      delegate_id,
    };

    if (isPaidParsed !== undefined) {
      patch.is_paid = isPaidParsed;

      // ✅ Consistencia: si NO pagada, limpiamos paid_date
      if (isPaidParsed === false) {
        patch.paid_date = null;
      }
    }

    const { error: upInvErr } = await supaRls
      .from("invoices")
      .update(patch)
      .eq("id", invoice_id);

    if (upInvErr) return json(500, { ok: false, stage, error: upInvErr.message });

    // 7) Si aplicar al cliente: guardar en cliente + backfill facturas del cliente
    if (apply_delegate_to_client) {
      stage = "apply_delegate_to_client";

      if (!client_id) {
        return json(400, {
          ok: false,
          stage,
          error: "Invoice has no client_id; cannot apply delegate to client",
        });
      }

      const { error: upClientErr } = await supaRls
        .from("clients")
        .update({ delegate_id })
        .eq("id", client_id);

      if (upClientErr) return json(500, { ok: false, stage, error: upClientErr.message });

      const { error: backfillErr } = await supaRls
        .from("invoices")
        .update({ delegate_id })
        .eq("client_id", client_id);

      if (backfillErr) return json(500, { ok: false, stage, error: backfillErr.message });
    }

    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message || String(e) });
  }
}
