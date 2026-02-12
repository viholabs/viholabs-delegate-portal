// src/app/api/shopify/kpis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentActor } from "@/lib/auth/current-actor";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Timeframe = "LIVE" | "WTD" | "MTD";

const TTL_S = 240;
const SOURCE = "shopify";
const ACTION = "SHOPIFY_KPI_READ";

function parseTimeframe(req: NextRequest): Timeframe {
  const tf = (req.nextUrl.searchParams.get("timeframe") || "LIVE").toUpperCase();
  if (tf === "LIVE" || tf === "WTD" || tf === "MTD") return tf;
  return "LIVE";
}

function nowIso() {
  return new Date().toISOString();
}

function requestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) throw new Error("Missing SUPABASE env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

function computePlaceholder(domains: string[]) {
  const data: any = {};
  if (domains.includes("ops")) data.ops = { orders_live_count: null };
  if (domains.includes("marketing")) data.marketing = { sessions: null };
  if (domains.includes("origin")) data.origin = { attributed_orders_count: null };
  return data;
}

/**
 * Auditoria mínima (no rompe), adaptada a l'esquema real de public.audit_log:
 * columns: id, created_at, user_id, actor_id, action, entity, entity_id, status, meta, state_code
 *
 * Guardem errors dins meta.error (NO existeix columna error_message).
 */
async function tryAuditLog(
  supaService: any,
  payload: {
    action: string;
    actor_id: string;
    status: "ok" | "error";
    meta: any;
    error_message?: string | null;
  }
): Promise<{ ok: boolean; warning?: string }> {
  try {
    const meta = {
      ...(payload.meta ?? {}),
      ...(payload.error_message ? { error: payload.error_message } : {}),
    };

    const { error } = await supaService.from("audit_log").insert({
      action: payload.action,
      actor_id: payload.actor_id,
      status: payload.status,
      meta,
      entity: "shopify_kpis",
      entity_id: null,
      state_code: "OPEN",
      user_id: null,
    });

    if (error) return { ok: false, warning: `audit_log insert failed: ${error.message}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, warning: `audit_log insert exception: ${e?.message ?? String(e)}` };
  }
}

/**
 * Fallback canònic:
 * - si el gate DB retorna [] però effective_permissions indica super_admin (*)
 *   o marker MELQUISEDEC, permetem dominis per defecte.
 */
async function domainsFallbackFromEffectivePermissions(actorId: string): Promise<string[]> {
  const eff = await getEffectivePermissionsByActorId(actorId);

  if (eff.isSuperAdmin || eff.has("__MELQUISEDEC__")) {
    return ["ops", "marketing", "origin"];
  }

  // (Futur) mapping per perms reals, si cal.
  return [];
}

export async function GET(req: NextRequest) {
  const rid = requestId();
  const timeframe = parseTimeframe(req);

  const startedAt = Date.now();
  let auditWarning: string | null = null;

  let actor: any = null;

  // per auditar (encara que falli)
  let domainsForAudit: string[] = [];
  let cacheHitForAudit: boolean | null = null;
  let stage = "init";

  try {
    stage = "require_actor";
    actor = await requireCurrentActor();

    const supaService = getServiceSupabase();

    // 1) Gate DB (primari)
    stage = "domains_rpc";
    const { data: domArr, error: eDom } = await supaService.rpc("fn_shopify_allowed_domains_v1_cache", {
      p_actor_id: actor.id,
    });

    if (eDom) {
      const msg = `DOMAINS_RPC_ERROR: ${eDom.message}`;

      const a = await tryAuditLog(supaService, {
        action: ACTION,
        actor_id: String(actor.id),
        status: "error",
        meta: {
          source: SOURCE,
          timeframe,
          request_id: rid,
          stage,
          duration_ms: Date.now() - startedAt,
        },
        error_message: msg,
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return NextResponse.json(
        {
          ok: false,
          error: msg,
          request_id: rid,
          ...(auditWarning ? { audit_warning: auditWarning } : {}),
        },
        { status: 500 }
      );
    }

    let domains = Array.isArray(domArr) ? domArr : [];

    // 2) Fallback (si DB retorna [])
    stage = "domains_fallback";
    if (domains.length === 0) {
      domains = await domainsFallbackFromEffectivePermissions(String(actor.id));
    }

    domainsForAudit = domains;

    if (domains.length === 0) {
      stage = "forbidden";

      const a = await tryAuditLog(supaService, {
        action: ACTION,
        actor_id: String(actor.id),
        status: "error",
        meta: {
          source: SOURCE,
          timeframe,
          request_id: rid,
          stage,
          duration_ms: Date.now() - startedAt,
          domains: [],
        },
        error_message: "No domains allowed for this actor",
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return NextResponse.json(
        {
          ok: false,
          error: "FORBIDDEN",
          request_id: rid,
          ...(auditWarning ? { audit_warning: auditWarning } : {}),
        },
        { status: 403 }
      );
    }

    // cache-key inclou domains (ordenats)
    const key = `kpis::${timeframe}::${domains.slice().sort().join(",")}`;

    // 3) Cache read
    stage = "cache_read";
    const { data: cached, error: eCacheRead } = await supaService
      .from("shopify_live_cache")
      .select("payload, expires_at")
      .eq("key", key)
      .maybeSingle();

    if (eCacheRead) {
      const msg = `CACHE_READ_ERROR: ${eCacheRead.message}`;

      const a = await tryAuditLog(supaService, {
        action: ACTION,
        actor_id: String(actor.id),
        status: "error",
        meta: {
          source: SOURCE,
          timeframe,
          request_id: rid,
          stage,
          duration_ms: Date.now() - startedAt,
          domains,
        },
        error_message: msg,
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return NextResponse.json(
        {
          ok: false,
          error: msg,
          request_id: rid,
          ...(auditWarning ? { audit_warning: auditWarning } : {}),
        },
        { status: 500 }
      );
    }

    if (cached?.expires_at && new Date(cached.expires_at).getTime() > Date.now()) {
      cacheHitForAudit = true;

      stage = "done_cache_hit";
      const a = await tryAuditLog(supaService, {
        action: ACTION,
        actor_id: String(actor.id),
        status: "ok",
        meta: {
          source: SOURCE,
          timeframe,
          request_id: rid,
          stage,
          duration_ms: Date.now() - startedAt,
          cache_hit: true,
          domains,
        },
        error_message: null,
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return NextResponse.json({
        ...cached.payload,
        cache: { hit: true },
        request_id: rid,
        ...(auditWarning ? { audit_warning: auditWarning } : {}),
      });
    }

    // 4) Payload (placeholder)
    stage = "payload_build";
    const payload = {
      ok: true,
      timeframe,
      generated_at: nowIso(),
      domains,
      data: computePlaceholder(domains),
      meta: { source: SOURCE, action: ACTION },
    };

    // 5) Cache upsert
    stage = "cache_upsert";
    const { error: eUp } = await supaService.from("shopify_live_cache").upsert({
      key,
      payload,
      expires_at: new Date(Date.now() + TTL_S * 1000).toISOString(),
      updated_at: nowIso(),
      state_code: "OPEN",
    });

    if (eUp) {
      const msg = `CACHE_UPSERT_ERROR: ${eUp.message}`;

      const a = await tryAuditLog(supaService, {
        action: ACTION,
        actor_id: String(actor.id),
        status: "error",
        meta: {
          source: SOURCE,
          timeframe,
          request_id: rid,
          stage,
          duration_ms: Date.now() - startedAt,
          cache_hit: false,
          domains,
        },
        error_message: msg,
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return NextResponse.json(
        {
          ok: false,
          error: msg,
          request_id: rid,
          ...(auditWarning ? { audit_warning: auditWarning } : {}),
        },
        { status: 500 }
      );
    }

    // 6) Auditar OK (cache miss)
    cacheHitForAudit = false;
    stage = "done_cache_miss";

    const a = await tryAuditLog(supaService, {
      action: ACTION,
      actor_id: String(actor.id),
      status: "ok",
      meta: {
        source: SOURCE,
        timeframe,
        request_id: rid,
        stage,
        duration_ms: Date.now() - startedAt,
        cache_hit: false,
        domains,
      },
      error_message: null,
    });
    if (!a.ok) auditWarning = a.warning ?? null;

    return NextResponse.json({
      ...payload,
      cache: { hit: false },
      request_id: rid,
      ...(auditWarning ? { audit_warning: auditWarning } : {}),
    });
  } catch (e: any) {
    const msg = e?.message ?? "ERROR";

    // intent d’auditar excepció (si podem construir service client)
    try {
      const supaService = getServiceSupabase();
      if (actor?.id) {
        const a = await tryAuditLog(supaService, {
          action: ACTION,
          actor_id: String(actor.id),
          status: "error",
          meta: {
            source: SOURCE,
            timeframe,
            request_id: rid,
            stage: `unhandled:${stage}`,
            duration_ms: Date.now() - startedAt,
            domains: domainsForAudit,
            cache_hit: cacheHitForAudit,
          },
          error_message: msg,
        });
        // no retornem warning aquí si falla; mantenim resposta simple
        void a;
      }
    } catch {
      // no fem res
    }

    return NextResponse.json(
      {
        ok: false,
        error: msg,
        request_id: rid,
        debug_actor_id: actor?.id ?? null,
      },
      { status: 500 }
    );
  }
}
