import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";
import { isShopifyConfigured } from "@/lib/shopify/shopifyClient";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function GET(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const supa = ctx.supaService;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const financialStatus = url.searchParams.get("financial_status") ?? null;

  const configured = isShopifyConfigured();
  if (!configured) {
    return json(200, { ok: true, configured: false, orders: [], total: 0, summary: null });
  }

  const shopDomain = (process.env.SHOPIFY_SHOP_DOMAIN ?? "").trim();

  // Build query
  let q = supa
    .from("shopify_orders_raw")
    .select("id, order_id, order_name, processed_at, updated_at, financial_status, fulfillment_status, email, total_price, currency, discount_codes, client_id", { count: "exact" })
    .eq("shop_domain", shopDomain)
    .order("processed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (financialStatus) q = q.eq("financial_status", financialStatus);

  const { data: orders, count, error } = await q;
  if (error) return json(500, { ok: false, error: error.message });

  // Load client names for matched orders
  const clientIds = [...new Set((orders ?? []).filter((o: any) => o.client_id).map((o: any) => o.client_id as string))];
  let clientById = new Map<string, { name: string | null; contact_email: string | null }>();
  if (clientIds.length > 0) {
    const { data: clients } = await supa
      .from("clients")
      .select("id, name, contact_email")
      .in("id", clientIds);
    clientById = new Map((clients ?? []).map((c: { id: string; name: string | null; contact_email: string | null }) => [c.id, c]));
  }

  // Summary stats
  const { data: summaryData } = await supa
    .from("shopify_orders_raw")
    .select("financial_status, total_price, client_id")
    .eq("shop_domain", shopDomain);

  const summary = {
    total_orders: summaryData?.length ?? 0,
    paid_orders: summaryData?.filter((o: any) => o.financial_status === "paid").length ?? 0,
    pending_orders: summaryData?.filter((o: any) => o.financial_status === "pending").length ?? 0,
    total_revenue: summaryData?.reduce((s: number, o: any) => s + (parseFloat(o.total_price) || 0), 0) ?? 0,
    matched_clients: summaryData?.filter((o: any) => o.client_id).length ?? 0,
    unmatched_orders: summaryData?.filter((o: any) => !o.client_id).length ?? 0,
  };

  const enrichedOrders = (orders ?? []).map((o: any) => {
    const client = o.client_id ? clientById.get(o.client_id) : null;
    return {
      ...o,
      client_name: client?.name ?? null,
      client_email: client?.contact_email ?? null,
    };
  });

  return json(200, {
    ok: true,
    configured: true,
    orders: enrichedOrders,
    total: count ?? 0,
    summary,
  });
}
