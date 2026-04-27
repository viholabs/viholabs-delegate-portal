// VIHOLABS — Shopify Admin API Client
// Single source of truth for all Shopify Admin API traffic

export class ShopifyClientError extends Error {
  public readonly status: number | null;
  public readonly body: unknown;
  constructor(message: string, status: number | null = null, body: unknown = null) {
    super(message);
    this.name = "ShopifyClientError";
    this.status = status;
    this.body = body;
  }
}

function requireConfig(): { domain: string; token: string; version: string } {
  const domain = (process.env.SHOPIFY_SHOP_DOMAIN ?? "").trim();
  const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "").trim();
  const version = (process.env.SHOPIFY_API_VERSION ?? "2026-01").trim();
  if (!domain) throw new ShopifyClientError("SHOPIFY_SHOP_DOMAIN not set");
  if (!token) throw new ShopifyClientError("SHOPIFY_ADMIN_ACCESS_TOKEN not set");
  return { domain, token, version };
}

export function isShopifyConfigured(): boolean {
  return !!(process.env.SHOPIFY_SHOP_DOMAIN?.trim() && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim());
}

async function shopifyFetch<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<{ data: T; nextPageInfo: string | null }> {
  const { domain, token, version } = requireConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 15_000);

  const url = `https://${domain}/admin/api/${version}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": token,
        ...(init?.headers ?? {}),
      } as HeadersInit,
      signal: controller.signal,
    });

    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }

    if (!res.ok) throw new ShopifyClientError(`Shopify HTTP ${res.status} on ${path}`, res.status, body);

    // Parse next page link header for pagination
    const linkHeader = res.headers.get("Link") ?? "";
    const nextMatch = linkHeader.match(/<[^>]+[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    const nextPageInfo = nextMatch ? nextMatch[1] : null;

    return { data: body as T, nextPageInfo };
  } catch (err: unknown) {
    if (err instanceof ShopifyClientError) throw err;
    if (err && typeof err === "object" && "name" in err && (err as any).name === "AbortError") {
      throw new ShopifyClientError(`Shopify timeout on ${path}`);
    }
    throw new ShopifyClientError(`Shopify network error on ${path}`, null, err);
  } finally {
    clearTimeout(timeout);
  }
}

export type ShopifyOrder = {
  id: number;
  name: string;
  email: string | null;
  processed_at: string;
  created_at: string;
  updated_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  currency: string;
  discount_codes: { code: string; amount: string; type: string }[];
  note_attributes: { name: string; value: string }[];
  tags: string;
  customer: {
    id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  line_items: {
    id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string | null;
    vendor: string | null;
  }[];
  shipping_address: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    country_code: string | null;
  } | null;
  note: string | null;
  referring_site: string | null;
  landing_site: string | null;
};

export async function shopifyFetchOrders(params: {
  limit?: number;
  status?: string;
  financial_status?: string;
  created_at_min?: string;
  created_at_max?: string;
  page_info?: string;
} = {}): Promise<{ orders: ShopifyOrder[]; nextPageInfo: string | null }> {
  const { limit = 250, status = "any", page_info, ...rest } = params;

  const qs = new URLSearchParams();
  if (page_info) {
    // When paginating, only limit and page_info are allowed
    qs.set("limit", String(limit));
    qs.set("page_info", page_info);
  } else {
    qs.set("limit", String(limit));
    qs.set("status", status);
    if (rest.financial_status) qs.set("financial_status", rest.financial_status);
    if (rest.created_at_min) qs.set("created_at_min", rest.created_at_min);
    if (rest.created_at_max) qs.set("created_at_max", rest.created_at_max);
  }

  const { data, nextPageInfo } = await shopifyFetch<{ orders: ShopifyOrder[] }>(
    `/orders.json?${qs.toString()}`
  );

  return { orders: (data as any).orders ?? [], nextPageInfo };
}

export async function shopifyCountOrders(): Promise<number> {
  const { data } = await shopifyFetch<{ count: number }>("/orders/count.json?status=any");
  return (data as any).count ?? 0;
}
