import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function normalizeMonthYYYYMM(v: any): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function monthRangeISO(monthYYYYMM: string) {
  const [y, m] = monthYYYYMM.split("-").map((x) => Number(x));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) };
}

function canAccessControlRoom(role: string) {
  const r = String(role ?? "").toLowerCase();
  return r === "admin" || r === "superadmin";
}

async function getActorOrThrow(supaAnon: any, authUserId: string) {
  const { data: actor, error: actorErr } = await supaAnon
    .from("actors")
    .select("id, role, status, name, email, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (actorErr) throw new Error(actorErr.message);
  if (!actor) throw new Error("Actor no encontrado");
  if (String(actor.status ?? "").toLowerCase() !== "active") throw new Error("Actor inactivo");
  return actor;
}

function toBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function isNeedsReview(row: any) {
  // ✅ REGLA MVP (lo que tú quieres):
  // Una factura deja de ser “needs review” cuando tiene:
  // - delegate_id informado
  // - source_channel informado (online/offline)
  // (is_paid lo puedes marcar o no; NO lo exigimos para quitar el badge)
  const missingDelegate = !row?.delegate_id;
  const missingChannel = !row?.source_channel || String(row.source_channel).trim() === "";
  return missingDelegate || missingChannel;
}

async function fetchInvoicesSafe(opts: {
  supaSvc: any;
  monthYYYYMM: string;
  q?: string | null;
  needsReview?: boolean;
}) {
  const { supaSvc, monthYYYYMM, q, needsReview } = opts;
  const { startISO, endISO } = monthRangeISO(monthYYYYMM);

  let query = supaSvc
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      invoice_date,
      client_id,
      delegate_id,
      is_paid,
      paid_date,
      total_gross,
      source_month,
      source_filename,
      source_provider,
      source_channel,
      created_at,
      clients:client_id ( name )
    `
    )
    .gte("invoice_date", startISO)
    .lt("invoice_date", endISO)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (q && String(q).trim()) {
    const qq = String(q).trim();
    query = query.or(`invoice_number.ilike.%${qq}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];

  const mapped = rows.map((r: any) => ({
    id: String(r.id),
    invoice_number: r.invoice_number ?? "—",
    invoice_date: r.invoice_date ?? null,
    client_id: r.client_id ?? null,
    client_name: r?.clients?.name ?? null,
    delegate_id: r.delegate_id ?? null,
    is_paid: r.is_paid ?? null,
    paid_date: r.paid_date ?? null,
    total_gross: r.total_gross ?? null,
    source_month: r.source_month ?? null,
    source_filename: r.source_filename ?? null,
    source_provider: r.source_provider ?? null,
    source_channel: r.source_channel ?? null,
    created_at: r.created_at ?? null,
  }));

  if (!needsReview) return mapped;
  return mapped.filter((r: any) => isNeedsReview(r));
}

export async function GET(req: Request) {
  let stage = "init";

  try {
    stage = "auth_token";
    const token = getBearerToken(req);
    if (!token) return json(401, { ok: false, stage, error: "Falta Authorization Bearer token" });

    stage = "env";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon || !service) {
      return json(500, { ok: false, stage, error: "Faltan variables SUPABASE (URL/ANON/SERVICE_ROLE)." });
    }

    stage = "clients";
    const supaAnon = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const supaSvc = createClient(url, service, { auth: { persistSession: false } });

    stage = "auth_user";
    const { data: u, error: uErr } = await supaAnon.auth.getUser();
    if (uErr) return json(401, { ok: false, stage, error: uErr.message });
    if (!u?.user?.id) return json(401, { ok: false, stage, error: "Usuario no autenticado" });

    stage = "actor";
    const actor = await getActorOrThrow(supaAnon, u.user.id);
    if (!canAccessControlRoom(String(actor.role ?? ""))) {
      return json(403, { ok: false, stage, error: "No autorizado (solo admin/superadmin)" });
    }

    stage = "params";
    const { searchParams } = new URL(req.url);
    const monthYYYYMM = normalizeMonthYYYYMM(searchParams.get("month"));
    const q = searchParams.get("q");
    const needsReview = String(searchParams.get("needs_review") ?? "") === "1";
    const countOnly = String(searchParams.get("count_only") ?? "") === "1";

    if (!monthYYYYMM) return json(400, { ok: false, stage, error: "month inválido. Usa YYYY-MM o YYYY-MM-01" });

    stage = "fetch";
    const invoices = await fetchInvoicesSafe({ supaSvc, monthYYYYMM, q, needsReview });

    if (countOnly) {
      return json(200, { ok: true, month: monthYYYYMM, count: invoices.length });
    }

    return json(200, { ok: true, month: monthYYYYMM, invoices });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error desconocido" });
  }
}

export async function PATCH(req: Request) {
  let stage = "init";

  try {
    stage = "auth_token";
    const token = getBearerToken(req);
    if (!token) return json(401, { ok: false, stage, error: "Falta Authorization Bearer token" });

    stage = "env";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon || !service) {
      return json(500, { ok: false, stage, error: "Faltan variables SUPABASE (URL/ANON/SERVICE_ROLE)." });
    }

    stage = "clients";
    const supaAnon = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const supaSvc = createClient(url, service, { auth: { persistSession: false } });

    stage = "auth_user";
    const { data: u, error: uErr } = await supaAnon.auth.getUser();
    if (uErr) return json(401, { ok: false, stage, error: uErr.message });
    if (!u?.user?.id) return json(401, { ok: false, stage, error: "Usuario no autenticado" });

    stage = "actor";
    const actor = await getActorOrThrow(supaAnon, u.user.id);
    if (!canAccessControlRoom(String(actor.role ?? ""))) {
      return json(403, { ok: false, stage, error: "No autorizado (solo admin/superadmin)" });
    }

    stage = "body";
    const body = await req.json().catch(() => ({} as any));
    const invoiceId = String(body?.invoice_id ?? "").trim();
    if (!invoiceId) return json(400, { ok: false, stage, error: "invoice_id requerido" });

    const patch: any = {};
    if (body.hasOwnProperty("is_paid")) patch.is_paid = toBool(body.is_paid);
    if (body.hasOwnProperty("paid_date")) patch.paid_date = body.paid_date ?? null;
    if (body.hasOwnProperty("delegate_id")) patch.delegate_id = body.delegate_id ?? null;
    if (body.hasOwnProperty("source_channel")) patch.source_channel = body.source_channel ?? null;

    stage = "update_invoice";
    const { error: invErr } = await supaSvc.from("invoices").update(patch).eq("id", invoiceId);
    if (invErr) return json(400, { ok: false, stage, error: invErr.message });

    // Aplicar delegado al cliente (si se pide)
    const apply = !!body?.apply_delegate_to_client;
    if (apply && patch.delegate_id !== undefined) {
      stage = "get_invoice_client";
      const { data: inv, error: invGetErr } = await supaSvc
        .from("invoices")
        .select("id, client_id")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invGetErr) return json(400, { ok: false, stage, error: invGetErr.message });

      const clientId = inv?.client_id ?? null;
      if (clientId) {
        stage = "update_client_delegate";
        const { error: cErr } = await supaSvc
          .from("clients")
          .update({ delegate_id: patch.delegate_id ?? null })
          .eq("id", clientId);
        if (cErr) return json(400, { ok: false, stage, error: cErr.message });
      }
    }

    return json(200, { ok: true, invoice_id: invoiceId });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error desconocido" });
  }
}
