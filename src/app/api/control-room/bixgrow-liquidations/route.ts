import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const supa = ctx.supaService;
  const url = new URL(req.url);
  const affiliateId = url.searchParams.get("affiliate_account_id") ?? undefined;

  let query = supa
    .from("affiliate_liquidations")
    .select(
      "id, affiliate_account_id, amount, currency, period_from, period_to, state_code, notes, paid_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (affiliateId) query = query.eq("affiliate_account_id", affiliateId);

  const { data: liquidations, error } = await query;
  if (error) return json(500, { ok: false, error: error.message });

  const accountIds = [...new Set((liquidations ?? []).map((l: any) => l.affiliate_account_id))];
  const { data: accountsRaw } = accountIds.length > 0
    ? await supa
        .from("affiliate_accounts")
        .select("id, name, email")
        .in("id", accountIds)
    : { data: [] };

  const accounts = (accountsRaw ?? []) as any[];
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const rows = (liquidations ?? []).map((l: any) => ({
    ...l,
    affiliate_name: accountById.get(l.affiliate_account_id)?.name ?? null,
    affiliate_email: accountById.get(l.affiliate_account_id)?.email ?? null,
  }));

  return json(200, { ok: true, liquidations: rows });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const { affiliate_account_id, amount, period_from, period_to, notes, state_code, paid_at } = body as any;

  if (!affiliate_account_id || !amount || !period_from || !period_to) {
    return json(400, { ok: false, error: "Faltan campos requeridos: affiliate_account_id, amount, period_from, period_to" });
  }

  const supa = ctx.supaService;

  const { data, error } = await supa
    .from("affiliate_liquidations")
    .insert({
      affiliate_account_id,
      amount: Number(amount),
      currency: (body.currency as string) ?? "EUR",
      period_from,
      period_to,
      state_code: state_code ?? "PENDING",
      notes: notes ?? null,
      paid_at: paid_at ?? null,
    })
    .select("id, affiliate_account_id, amount, currency, period_from, period_to, state_code, paid_at, created_at")
    .single();

  if (error) return json(500, { ok: false, error: error.message });

  return json(201, { ok: true, liquidation: data });
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const { id, state_code, paid_at, notes } = body as any;
  if (!id) return json(400, { ok: false, error: "Falta id" });

  const supa = ctx.supaService;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (state_code !== undefined) update.state_code = state_code;
  if (paid_at !== undefined) update.paid_at = paid_at;
  if (notes !== undefined) update.notes = notes;

  const { data, error } = await supa
    .from("affiliate_liquidations")
    .update(update)
    .eq("id", id)
    .select("id, state_code, paid_at, notes, updated_at")
    .single();

  if (error) return json(500, { ok: false, error: error.message });

  return json(200, { ok: true, liquidation: data });
}
