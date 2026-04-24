/**
 * VIHOLABS — BixGrow API Client (canonical)
 *
 * BixGrow REST API base: https://api.bixgrow.com
 * Auth: header  key: {BIXGROW_API_KEY}  (same pattern as Holded)
 * App:  header  appid: {BIXGROW_APP_ID}
 *
 * Docs reference:  https://developers.bixgrow.com/
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const BIXGROW_BASE = "https://api.bixgrow.com";

export class BixGrowError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: unknown = null
  ) {
    super(message);
    this.name = "BixGrowError";
  }
}

function requireEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new BixGrowError(`Missing env var: ${name}`);
  return v;
}

export function isBixGrowConfigured(): boolean {
  return !!(
    process.env.BIXGROW_API_KEY?.trim() ||
    process.env.BIXGROW_APP_ID?.trim()
  );
}

async function bixgrowFetch<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const apiKey = requireEnv("BIXGROW_API_KEY");
  const appId = (process.env.BIXGROW_APP_ID ?? "").trim();

  const qs = new URLSearchParams();
  if (appId) qs.set("appid", appId);
  if (params) {
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  }

  const url = `${BIXGROW_BASE}${path}${qs.toString() ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      key: apiKey,
      ...(appId ? { appid: appId } : {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    throw new BixGrowError(`BixGrow HTTP ${res.status} on ${path}`, res.status, body);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BixGrowAffiliate = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  status: string | null;
  referral_code: string | null;
  commission_type: string | null;
  commission_value: number | null;
  balance: number | null;
  paid_out: number | null;
  created_at: string | null;
  [key: string]: unknown;
};

export type BixGrowConversion = {
  id: string;
  affiliate_id: string | null;
  customer_email: string | null;
  order_id: string | null;
  sub_total: number | null;
  commission: number | null;
  status: string | null;
  created_at: string | null;
  [key: string]: unknown;
};

type BixGrowListResponse<T> = {
  data?: T[];
  items?: T[];
  affiliates?: T[];
  conversions?: T[];
  [key: string]: unknown;
};

function extractList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const b = body as BixGrowListResponse<T>;
  return (
    b?.data ??
    b?.items ??
    b?.affiliates ??
    b?.conversions ??
    []
  );
}

// ---------------------------------------------------------------------------
// Public API calls
// ---------------------------------------------------------------------------

export async function listBixGrowAffiliates(opts?: { page?: number; limit?: number }): Promise<BixGrowAffiliate[]> {
  const params: Record<string, string | number> = {};
  if (opts?.page) params.page = opts.page;
  if (opts?.limit) params.limit = opts.limit;

  const body = await bixgrowFetch<unknown>("/api/affiliates/v1/affiliates", params);
  const raw = extractList<any>(body);

  return raw.map((r): BixGrowAffiliate => ({
    id: String(r.id ?? r._id ?? ""),
    email: r.email ?? r.mail ?? null,
    first_name: r.first_name ?? r.firstName ?? r.firstname ?? null,
    last_name: r.last_name ?? r.lastName ?? r.lastname ?? null,
    name: r.name ?? ([r.first_name ?? r.firstName, r.last_name ?? r.lastName].filter(Boolean).join(" ") || null),
    status: r.status ?? null,
    referral_code: r.referral_code ?? r.referralCode ?? r.code ?? null,
    commission_type: r.commission_type ?? r.commissionType ?? null,
    commission_value: r.commission_value ?? r.commissionValue ?? r.commission ?? null,
    balance: r.balance ?? null,
    paid_out: r.paid_out ?? r.paidOut ?? null,
    created_at: r.created_at ?? r.createdAt ?? null,
    ...r,
  }));
}

export async function listBixGrowConversions(opts?: {
  page?: number;
  limit?: number;
  affiliate_id?: string;
}): Promise<BixGrowConversion[]> {
  const params: Record<string, string | number> = {};
  if (opts?.page) params.page = opts.page;
  if (opts?.limit) params.limit = opts.limit;
  if (opts?.affiliate_id) params.affiliate_id = opts.affiliate_id;

  const body = await bixgrowFetch<unknown>("/api/conversions/v1/conversions", params);
  const raw = extractList<any>(body);

  return raw.map((r): BixGrowConversion => ({
    id: String(r.id ?? r._id ?? ""),
    affiliate_id: r.affiliate_id ?? r.affiliateId ?? null,
    customer_email: r.customer_email ?? r.customerEmail ?? r.email ?? null,
    order_id: r.order_id ?? r.orderId ?? r.order ?? null,
    sub_total: r.sub_total ?? r.subTotal ?? r.amount ?? r.total ?? null,
    commission: r.commission ?? r.commission_amount ?? r.commissionAmount ?? null,
    status: r.status ?? null,
    created_at: r.created_at ?? r.createdAt ?? null,
    ...r,
  }));
}
