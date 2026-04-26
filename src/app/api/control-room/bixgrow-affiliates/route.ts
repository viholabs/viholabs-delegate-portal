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

  // Load all affiliate accounts (BixGrow source first, then all)
  const { data: accounts, error: accErr } = await supa
    .from("affiliate_accounts")
    .select("id, name, email, affiliate_external_id, state_code, commission_value, commission_type, referral_code, balance, paid_out, source, synced_at")
    .order("name", { ascending: true });

  if (accErr) return json(500, { ok: false, error: accErr.message });

  const accountIds = (accounts ?? []).map((a: any) => a.id);

  if (accountIds.length === 0) {
    return json(200, { ok: true, affiliates: [] });
  }

  // Load attribution events to compute stats per affiliate
  const { data: events } = await supa
    .from("affiliate_attribution_events")
    .select("id, affiliate_account_id, client_id, commission_amount, order_amount, state_code, event_at, source")
    .in("affiliate_account_id", accountIds);

  // Load liquidations
  const { data: liquidations } = await supa
    .from("affiliate_liquidations")
    .select("affiliate_account_id, amount, state_code, period_from, period_to, paid_at")
    .in("affiliate_account_id", accountIds);

  // Load clients attributed to each affiliate
  const clientIds = [...new Set(
    (events ?? [])
      .map((e: any) => e.client_id)
      .filter(Boolean)
  )] as string[];

  const { data: clients } = clientIds.length > 0
    ? await supa.from("clients").select("id, name, contact_email, status").in("id", clientIds)
    : { data: [] };

  const clientById = new Map(((clients ?? []) as { id: string; name: string | null; contact_email: string | null; status: string | null }[]).map((c) => [c.id, c]));

  // Load invoice totals per client (real sales from Holded invoices)
  const { data: invoiceData } = clientIds.length > 0
    ? await supa
        .from("invoices")
        .select("client_id, total_net, is_paid")
        .in("client_id", clientIds)
        .not("total_net", "is", null)
    : { data: [] };

  const invByClient = new Map<string, { total: number; paid: number }>();
  for (const inv of (invoiceData ?? []) as { client_id: string; total_net: string | number; is_paid: boolean }[]) {
    const cid = inv.client_id;
    const existing = invByClient.get(cid) ?? { total: 0, paid: 0 };
    const net = Number(inv.total_net) || 0;
    existing.total += net;
    if (inv.is_paid) existing.paid += net;
    invByClient.set(cid, existing);
  }

  // Aggregate per affiliate
  const affiliates = (accounts ?? []).map((acc: any) => {
    const accEvents = (events ?? []).filter((e: any) => e.affiliate_account_id === acc.id);
    const accLiquidations = (liquidations ?? []).filter((l: any) => l.affiliate_account_id === acc.id);

    const REMOVABLE_SOURCES = ["manual", "manual_control_room", "email_match", "bixgrow_sync"];
    const attributedClients = accEvents
      .filter((e: any) => e.client_id)
      .map((e: any) => {
        const c = clientById.get(e.client_id);
        const inv = invByClient.get(e.client_id);
        return {
          event_id: e.id,
          client_id: e.client_id,
          client_name: c?.name ?? null,
          client_email: c?.contact_email ?? null,
          client_status: c?.status ?? null,
          source: e.source ?? "unknown",
          commission_amount: e.commission_amount ?? null,
          order_amount: e.order_amount ?? null,
          invoice_total: inv ? Number(inv.total.toFixed(2)) : null,
          invoice_paid_total: inv ? Number(inv.paid.toFixed(2)) : null,
          removable: REMOVABLE_SOURCES.includes(e.source),
        };
      });

    // Sales = sum of invoice totals for unique linked clients
    const uniqueClientIds = Array.from(new Set(attributedClients.map((c: { client_id: string }) => c.client_id))) as string[];
    const totalSales = uniqueClientIds.reduce((s: number, cid: string) => s + (invByClient.get(cid)?.total ?? 0), 0);
    const totalSalesPaid = uniqueClientIds.reduce((s: number, cid: string) => s + (invByClient.get(cid)?.paid ?? 0), 0);

    // Commission: prefer explicit commission_amount from events, else compute from rate
    const explicitCommission = accEvents.reduce((s: number, e: any) => s + (Number(e.commission_amount) || 0), 0);
    const commValue = Number(acc.commission_value) || 0;
    const commType = (acc.commission_type ?? "").toLowerCase();
    const computedCommission = commValue > 0 && commType.includes("%")
      ? totalSalesPaid * commValue / 100
      : 0;
    const totalCommission = explicitCommission > 0 ? explicitCommission : computedCommission;

    const totalLiquidated = accLiquidations
      .filter((l: any) => l.state_code === "PAID")
      .reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
    const pendingLiquidation = Math.max(0, totalCommission - totalLiquidated);

    return {
      id: acc.id,
      name: acc.name,
      email: acc.email,
      affiliate_external_id: acc.affiliate_external_id,
      referral_code: acc.referral_code,
      state_code: acc.state_code,
      source: acc.source,
      commission_value: acc.commission_value,
      commission_type: acc.commission_type,
      synced_at: acc.synced_at,
      stats: {
        total_events: accEvents.length,
        total_clients: uniqueClientIds.length,
        total_sales: Number(totalSales.toFixed(2)),
        total_sales_paid: Number(totalSalesPaid.toFixed(2)),
        total_commission: Number(totalCommission.toFixed(2)),
        total_liquidated: Number(totalLiquidated.toFixed(2)),
        pending_liquidation: Number(pendingLiquidation.toFixed(2)),
      },
      clients: attributedClients,
      liquidations: accLiquidations.map((l: any) => ({
        amount: l.amount,
        state_code: l.state_code,
        period_from: l.period_from,
        period_to: l.period_to,
        paid_at: l.paid_at,
      })),
    };
  });

  return json(200, { ok: true, affiliates });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const { name, email, referral_code, commission_value, commission_type, state_code, affiliate_external_id } = body;
  if (!name?.trim()) return json(400, { ok: false, error: "El nombre es obligatorio" });

  const supa = ctx.supaService;
  const { data, error } = await supa
    .from("affiliate_accounts")
    .insert({
      name: name.trim(),
      email: email?.trim()?.toLowerCase() || null,
      referral_code: referral_code?.trim() || null,
      commission_value: commission_value != null ? Number(commission_value) : null,
      commission_type: commission_type?.trim() || null,
      state_code: state_code || "OPEN",
      affiliate_external_id: affiliate_external_id?.trim() || null,
      source: "manual",
      synced_at: new Date().toISOString(),
    })
    .select("id, name, email, referral_code, commission_value, commission_type, state_code, affiliate_external_id, source, synced_at")
    .single();

  if (error) return json(500, { ok: false, error: error.message });
  return json(201, { ok: true, affiliate: data });
}
