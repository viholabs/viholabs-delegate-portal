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
    .select("affiliate_account_id, client_id, commission_amount, order_amount, state_code, event_at")
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
  )];

  const { data: clients } = clientIds.length > 0
    ? await supa.from("clients").select("id, name, contact_email, status").in("id", clientIds)
    : { data: [] };

  const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));

  // Aggregate per affiliate
  const affiliates = (accounts ?? []).map((acc: any) => {
    const accEvents = (events ?? []).filter((e: any) => e.affiliate_account_id === acc.id);
    const accLiquidations = (liquidations ?? []).filter((l: any) => l.affiliate_account_id === acc.id);

    const totalCommission = accEvents.reduce((s: number, e: any) => s + (Number(e.commission_amount) || 0), 0);
    const totalSales = accEvents.reduce((s: number, e: any) => s + (Number(e.order_amount) || 0), 0);
    const totalLiquidated = accLiquidations
      .filter((l: any) => l.state_code === "PAID")
      .reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
    const pendingLiquidation = Math.max(0, totalCommission - totalLiquidated);

    const attributedClients = [...new Set(accEvents.map((e: any) => e.client_id).filter(Boolean) as string[])]
      .map((cid) => clientById.get(cid))
      .filter(Boolean)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.contact_email,
        status: c.status,
      }));

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
        total_clients: attributedClients.length,
        total_sales: Number(totalSales.toFixed(2)),
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
