import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";
import { shopifyFetchOrders, isShopifyConfigured, ShopifyClientError } from "@/lib/shopify/shopifyClient";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  if (!isShopifyConfigured()) {
    return json(400, { ok: false, error: "Shopify no configurado. Añade SHOPIFY_SHOP_DOMAIN y SHOPIFY_ADMIN_ACCESS_TOKEN." });
  }

  const supa = ctx.supaService;
  const shopDomain = (process.env.SHOPIFY_SHOP_DOMAIN ?? "").trim();

  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch { body = {}; }
  const fullSync = body.full === true;

  // For incremental: only fetch orders updated in last 7 days
  const createdAtMin = fullSync
    ? undefined
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let upserted = 0;
  let errors = 0;
  let pageInfo: string | null = null;
  let page = 0;

  try {
    do {
      page++;
      const { orders, nextPageInfo } = await shopifyFetchOrders({
        limit: 250,
        status: "any",
        created_at_min: createdAtMin,
        page_info: pageInfo ?? undefined,
      });

      if (orders.length === 0) break;

      // Upsert batch into shopify_orders_raw
      for (const order of orders) {
        const email = order.customer?.email ?? order.email ?? null;
        const { error } = await supa
          .from("shopify_orders_raw")
          .upsert({
            shop_domain: shopDomain,
            order_id: order.id,
            order_name: order.name,
            processed_at: order.processed_at,
            updated_at: order.updated_at,
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status ?? null,
            email,
            total_price: parseFloat(order.total_price) || 0,
            currency: order.currency,
            discount_codes: order.discount_codes?.length ? order.discount_codes : null,
            raw: order,
          }, { onConflict: "order_id" });

        if (error) errors++;
        else upserted++;
      }

      pageInfo = nextPageInfo;
      // Safety: max 10 pages (2500 orders) per sync call
    } while (pageInfo && page < 10);

    // After sync, auto-match emails to clients
    const { data: unmatched } = await supa
      .from("shopify_orders_raw")
      .select("id, email")
      .is("client_id", null)
      .not("email", "is", null)
      .limit(500);

    let matched = 0;
    for (const row of (unmatched ?? []) as any[]) {
      if (!row.email) continue;
      const { data: client } = await supa
        .from("clients")
        .select("id")
        .eq("contact_email", row.email.toLowerCase())
        .maybeSingle();
      if (client?.id) {
        await supa.from("shopify_orders_raw").update({ client_id: client.id }).eq("id", row.id);
        matched++;
      }
    }

    return json(200, { ok: true, upserted, errors, client_matches: matched, pages_fetched: page });
  } catch (err: unknown) {
    const msg = err instanceof ShopifyClientError ? err.message : String(err);
    return json(500, { ok: false, error: msg });
  }
}
