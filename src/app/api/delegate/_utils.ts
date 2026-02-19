// src/app/api/delegate/_utils.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type EffectivePerms = {
  isSuperAdmin: boolean;
  has: (perm: string) => boolean;
};

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getEnvOrThrow() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    throw new Error("Missing SUPABASE env vars (URL/ANON/SERVICE_ROLE)");
  }

  return { url, anon, service };
}

/**
 * Cliente SERVICE ROLE: bypass RLS.
 * Úsalo SOLO para tareas internas (lookup actor, escrituras internas auditadas, motores).
 */
export function getServiceClient() {
  const { url, service } = getEnvOrThrow();
  return createClient(url, service, { auth: { persistSession: false } });
}

/**
 * Cliente RLS: usa ANON + JWT del usuario para que apliquen policies RLS.
 * Este es el cliente que deben usar los endpoints /api/delegate/* para leer datos
 * cuando vienen por Bearer token.
 */
export function getRlsClientFromToken(token: string) {
  const { url, anon } = getEnvOrThrow();
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

/**
 * ✅ CANÓNICO (FUTURO-SOLIDO):
 * Resuelve el actor con DOS vías, en este orden:
 *  1) Cookies SSR (Next 15 + @supabase/ssr)  ← permite abrir endpoints en navegador
 *  2) Bearer token (compatibilidad con frontend actual y integraciones)
 *
 * Devuelve:
 *  - supaRls: cliente con RLS ON (cookies o token)
 *  - supaService: service role para escrituras internas
 *  - actor: actor de negocio resuelto por auth_user_id
 */
export async function getActorFromRequest(req: Request) {
  let stage = "init";

  try {
    const supaService = getServiceClient();

    // -------------------------
    // 1) Intento por COOKIES SSR
    // -------------------------
    stage = "cookies_auth";
    try {
      const supaRlsCookies = await createServerSupabaseClient();
      const { data: uData, error: uErr } = await supaRlsCookies.auth.getUser();
      const user = uData?.user;

      if (!uErr && user?.id) {
        const authUserId = user.id;

        stage = "cookies_lookup_actor";
        const { data: actor, error: aErr } = await supaService
          .from("actors")
          .select("id, role, status, name, email, auth_user_id")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        if (aErr) return { ok: false as const, status: 500, error: aErr.message };
        if (!actor) return { ok: false as const, status: 403, error: "Actor not found" };

        if (String(actor.status ?? "").toLowerCase() !== "active") {
          return { ok: false as const, status: 403, error: "Actor inactive" };
        }

        return {
          ok: true as const,
          supaService,
          supaRls: supaRlsCookies,
          actor,
          authUserId,
          authMode: "cookies" as const,
        };
      }
    } catch {
      // Si cookies no están disponibles en este contexto, seguimos al Bearer token
    }

    // -------------------------
    // 2) Fallback por BEARER token
    // -------------------------
    stage = "bearer_token";
    const token = getBearerToken(req);
    if (!token) {
      return { ok: false as const, status: 401, error: "Missing Bearer token" };
    }

    // -------------------------
    // 2A) INTERNAL BEARER (CANONICAL SUPER_ADMIN bypass)
    // -------------------------
    stage = "internal_bearer";
    const internal = String(process.env.VIHOLABS_INTERNAL_BEARER ?? "").trim();
    if (internal && token === internal) {
      // Deterministic: pick an ACTIVE SUPER_ADMIN actor from DB truth.
      // NOTE: No schema changes. No heuristics beyond "role=SUPER_ADMIN & status=active".
      const { data: actors, error: aErr } = await supaService
        .from("actors")
        .select("id, role, status, name, email, auth_user_id")
        .eq("status", "active")
        .in("role", ["SUPER_ADMIN", "super_admin"])
        .limit(1);

      if (aErr) return { ok: false as const, status: 500, error: aErr.message };
      const actor = Array.isArray(actors) ? actors[0] : null;
      if (!actor) return { ok: false as const, status: 403, error: "Super admin actor not found" };

      return {
        ok: true as const,
        supaService,
        supaRls: supaService, // internal bearer = service role (bypass RLS)
        actor,
        authUserId: actor.auth_user_id ?? null,
        authMode: "internal_bearer" as const,
      };
    }

    const { url, anon } = getEnvOrThrow();

    stage = "bearer_validate";
    const supaAnon = createClient(url, anon, { auth: { persistSession: false } });
    const { data: uData, error: uErr } = await supaAnon.auth.getUser(token);
    const user = uData?.user;

    if (uErr || !user?.id) {
      return { ok: false as const, status: 401, error: "Invalid token" };
    }

    const authUserId = user.id;

    stage = "bearer_lookup_actor";
    const { data: actor, error: aErr } = await supaService
      .from("actors")
      .select("id, role, status, name, email, auth_user_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (aErr) return { ok: false as const, status: 500, error: aErr.message };
    if (!actor) return { ok: false as const, status: 403, error: "Actor not found" };

    if (String(actor.status ?? "").toLowerCase() !== "active") {
      return { ok: false as const, status: 403, error: "Actor inactive" };
    }

    stage = "bearer_rls_client";
    const supaRls = getRlsClientFromToken(token);

    return {
      ok: true as const,
      supaService,
      supaRls,
      actor,
      authUserId,
      authMode: "bearer" as const,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return { ok: false as const, status: 500, error: msg, stage };
  }
}

type ResolveDelegateArgs = {
  supaRls: any;
  actor: { id: string; role: string | null };
  delegateIdFromQuery?: string | null;

  /**
   * ✅ CANÓNICO (nuevo): si lo pasas, la “supervisión” se decide por permisos efectivos, NO por roles hardcoded.
   * Mantiene compatibilidad: si no lo pasas, cae al comportamiento legacy por rol.
   */
  effectivePerms?: EffectivePerms | null;
};

/**
 * Resolver delegate_id:
 * - Self: delegates.actor_id = actor.id
 * - Supervision/impersonation: solo si viene delegateIdFromQuery y el actor tiene permisos efectivos de supervisión
 */
export async function resolveDelegateIdOrThrow(args: ResolveDelegateArgs) {
  const { supaRls, actor, delegateIdFromQuery, effectivePerms } = args;

  // ✅ Nuevo: supervisión por permisos (Biblia: NO roles hardcoded)
  if (delegateIdFromQuery && effectivePerms) {
    const canImpersonate =
      effectivePerms.isSuperAdmin ||
      effectivePerms.has("actors.read") ||
      effectivePerms.has("control_room.delegates.read") ||
      effectivePerms.has("assignments.read");

    if (canImpersonate) return delegateIdFromQuery;
  }

  // Legacy: compatibilidad (si aún hay endpoints antiguos que no pasan effectivePerms)
  const role = String(actor.role ?? "").toUpperCase();
  if (
    delegateIdFromQuery &&
    (role === "SUPER_ADMIN" ||
      role === "ADMINISTRATIVE" ||
      role === "COORDINATOR_COMMERCIAL" ||
      role === "COORDINATOR_CECT")
  ) {
    return delegateIdFromQuery;
  }

  // Delegate normal: delegates.actor_id = actor.id
  const { data: d, error: dErr } = await supaRls
    .from("delegates")
    .select("id, actor_id, active")
    .eq("actor_id", actor.id)
    .maybeSingle();

  if (dErr) throw new Error(dErr.message);
  if (!d?.id) throw new Error("Delegate not found for actor");
  return d.id as string;
}
