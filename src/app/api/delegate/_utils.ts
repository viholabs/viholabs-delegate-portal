// src/app/api/delegate/_utils.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

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

export function getServiceClient() {
  const { url, service } = getEnvOrThrow();
  return createClient(url, service, { auth: { persistSession: false } });
}

/**
 * Lee actor (service role) a partir de un request con Authorization: Bearer <access_token>.
 * - Valida el token con ANON (auth.getUser(jwt))
 * - Consulta actor con SERVICE ROLE (bypass RLS)
 * - Fallback por email si actors.auth_user_id no está vinculado
 */
export async function getActorFromRequest(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return { ok: false as const, status: 401, error: "Missing Bearer token" };

    const { url, anon, service } = getEnvOrThrow();

    // 1) Validar JWT con ANON
    const supaAnon = createClient(url, anon, { auth: { persistSession: false } });
    const { data: uData, error: uErr } = await supaAnon.auth.getUser(token);
    const user = uData?.user;
    if (uErr || !user?.id) return { ok: false as const, status: 401, error: "Invalid token" };

    const authUserId = user.id;
    const email = user.email ?? null;

    // 2) DB con SERVICE ROLE
    const supa = createClient(url, service, { auth: { persistSession: false } });

    // 3) Buscar actor por auth_user_id
    const { data: actor, error: aErr } = await supa
      .from("actors")
      .select("id, role, status, name, email, auth_user_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    // Fallback por email si no está vinculado
    if (aErr || !actor) {
      if (!email) return { ok: false as const, status: 403, error: "Actor not found" };

      const { data: actor2, error: a2Err } = await supa
        .from("actors")
        .select("id, role, status, name, email, auth_user_id")
        .eq("email", email)
        .maybeSingle();

      if (a2Err) return { ok: false as const, status: 500, error: a2Err.message };
      if (!actor2) return { ok: false as const, status: 403, error: "Actor not found" };
      if (String(actor2.status ?? "").toLowerCase() !== "active") {
        return { ok: false as const, status: 403, error: "Actor inactive" };
      }

      return { ok: true as const, supa, actor: actor2, authUserId };
    }

    if (String(actor.status ?? "").toLowerCase() !== "active") {
      return { ok: false as const, status: 403, error: "Actor inactive" };
    }

    return { ok: true as const, supa, actor, authUserId };
  } catch (e: any) {
    return { ok: false as const, status: 500, error: e?.message ?? "Server error" };
  }
}

export async function resolveDelegateIdOrThrow(args: {
  supa: any;
  actor: { id: string; role: string };
  delegateIdFromQuery?: string | null;
}) {
  const { supa, actor, delegateIdFromQuery } = args;

  // Supervisión: admin/superadmin pueden “impersonar” delegateId
  if (delegateIdFromQuery && (actor.role === "admin" || actor.role === "superadmin")) {
    return delegateIdFromQuery;
  }

  // Delegate normal: delegates.actor_id = actor.id
  const { data: d, error: dErr } = await supa
    .from("delegates")
    .select("id, actor_id, active")
    .eq("actor_id", actor.id)
    .maybeSingle();

  if (dErr || !d?.id) throw new Error("Delegate not found for actor");
  return d.id as string;
}
