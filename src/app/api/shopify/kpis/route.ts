import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Shopify KPIs (LIVE informativo, NO contable)
 * - Gates por misión via Supabase: fn_shopify_allowed_domains_v1_cache(actor_id)
 * - Cache efímero in-memory (TTL 180-300s)
 * - Auditoría obligatoria: public.audit_log
 * - Prohibido: persistir "verdad Shopify" o devolver campos contables (tax/vat/net/payout/etc)
 */

type Timeframe = "LIVE" | "WTD" | "MTD";
type Domain = "ops" | "marketing" | "origin";

type KpisResponse = {
  ok: boolean;
  timeframe: Timeframe;
  domains: Domain[];
  cache: { hit: boolean; ttl_s: number; stale?: boolean };
  request_id: string;
  generated_at: string;
  data: Record<string, unknown>;
};

const TTL_S = 240; // 4 min (canon: 3–5 min)
const CACHE = new Map<string, { expiresAt: number; payload: KpisResponse }>();

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function nowIso() {
  return new Date().toISOString();
}

function genRequestId() {
  // suficientemente único para auditoría (no criptográfico)
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseTimeframe(req: NextRequest): Timeframe {
  const tf = (req.nextUrl.searchParams.get("timeframe") || "LIVE").toUpperCase();
  if (tf === "LIVE" || tf === "WTD" || tf === "MTD") return tf;
  return "LIVE";
}

function buildCacheKey(actorId: string, timeframe: Timeframe, domains: Domain[]) {
  return `${actorId}::${timeframe}::${domains.slice().sort().join(",")}`;
}

async function auditShopifyRead(params: {
  actor_id: string | null;
  action: string;
  status: "ok" | "error" | "denied";
  meta: Record<string, unknown>;
}) {
  try {
    // usamos el mismo patrón que el resto del repo: service insert puede fallar sin romper
    const supa = await createSupabaseServerClient();
    const { error } = await supa.from("audit_log").insert({
      actor_id: params.actor_id,
      action: params.action,
      entity: "shopify",
      entity_id: null,
      status: params.status,
      meta: params.meta,
      state_code: "OPEN",
    });
    if (error) {
      // no rompemos por auditoría (canon: audit obligatorio, pero no debe tumbar servicio)
      // se verá en logs del server
      console.warn("audit_log insert failed:", error.message);
    }
  } catch (e: any) {
    console.warn("audit_log insert exception:", e?.message ?? String(e));
  }
}

async function getActorIdFromSession(): Promise<{ actor_id: string | null; user_id: string | null }> {
  const supa = await createSupabaseServerClient();
  const { data: auth } = await supa.auth.getUser();
  const userId = auth?.user?.id ?? null;
  if (!userId) return { actor_id: null, user_id: null };

  // patrón existente en repo: actor_users vincula auth user -> actor
  const { data, error } = await supa
    .from("actor_users")
    .select("actor_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("actor_users lookup failed:", error.message);
    return { actor_id: null, user_id: userId };
  }

  return { actor_id: data?.actor_id ?? null, user_id: userId };
}

async function getAllowedDomains(actorId: string): Promise<Domain[]> {
  const supa = await createSupabaseServerClient();
  const { data, error } = await supa.rpc("fn_shopify_allowed_domains_v1_cache", { p_actor_id: actorId });
  if (error) {
    console.warn("fn_shopify_allowed_domains_v1_cache failed:", error.message);
    return [];
  }
  const arr = Array.isArray(data) ? data : [];
  return arr.filter((d: any) => d === "ops" || d === "marketing" || d === "origin");
}

// --- Shopify fetch minimal (MVP) ---
// Nota: aquí devolvemos placeholders estables. Sustituiremos por KPIs reales en el siguiente paso.
async function computeKpisMvp(timeframe: Timeframe, domains: Domain[]) {
  // NO contable: nada de tax/vat/net/payout
  const base: Record<string, unknown> = {
    ops: domains.includes("ops")
      ? {
          orders_live_count: null,
          orders_pending_activation_count: null, // "Comandes no activades" (placeholder)
        }
      : undefined,
    marketing: domains.includes("marketing")
      ? {
          sessions: null,
          conversion_rate: null,
        }
      : undefined,
    origin: domains.includes("origin")
      ? {
          attributed_orders_count: null,
          attributed_clients_count: null,
        }
      : undefined,
  };

  // limpiamos undefined
  Object.keys(base).forEach((k) => {
    if (base[k] === undefined) delete base[k];
  });

  return base;
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const request_id = genRequestId();
  const timeframe = parseTimeframe(req);

  // 1) Auth -> actor_id
  const { actor_id } = await getActorIdFromSession();
  if (!actor_id) {
    await auditShopifyRead({
      actor_id: null,
      action: "SHOPIFY_KPI_READ",
      status: "denied",
      meta: { request_id, timeframe, reason: "NO_ACTOR_SESSION" },
    });
    return json(401, { ok: false, error: "UNAUTHENTICATED", request_id });
  }

  // 2) Gate domains
  const domains = await getAllowedDomains(actor_id);
  if (!domains.length) {
    await auditShopifyRead({
      actor_id,
      action: "SHOPIFY_KPI_READ",
      status: "denied",
      meta: { request_id, timeframe, reason: "NO_DOMAINS_ALLOWED" },
    });
    return json(403, { ok: false, error: "FORBIDDEN", request_id });
  }

  // 3) Cache
  const key = buildCacheKey(actor_id, timeframe, domains);
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    const latency_ms = Date.now() - t0;
    await auditShopifyRead({
      actor_id,
      action: "SHOPIFY_KPI_READ",
      status: "ok",
      meta: {
        request_id,
        timeframe,
        domains,
        cache_hit: true,
        latency_ms,
      },
    });
    return NextResponse.json(hit.payload, { status: 200 });
  }

  // 4) Compute (MVP placeholders, siguiente paso: KPIs reales)
  const data = await computeKpisMvp(timeframe, domains);

  const payload: KpisResponse = {
    ok: true,
    timeframe,
    domains,
    cache: { hit: false, ttl_s: TTL_S },
    request_id,
    generated_at: nowIso(),
    data,
  };

  CACHE.set(key, { expiresAt: Date.now() + TTL_S * 1000, payload });

  const latency_ms = Date.now() - t0;
  await auditShopifyRead({
    actor_id,
    action: "SHOPIFY_KPI_READ",
    status: "ok",
    meta: {
      request_id,
      timeframe,
      domains,
      cache_hit: false,
      latency_ms,
    },
  });

  return NextResponse.json(payload, { status: 200 });
}
