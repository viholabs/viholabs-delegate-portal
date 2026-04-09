import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type ActorRow = {
  id: string;
  role: string | null;
  status: string | null;
  name: string | null;
  email: string | null;
  auth_user_id: string | null;
};

type ResolveActorOk = {
  ok: true;
  supaService: ReturnType<typeof createServiceClient>;
  supaRls: Awaited<ReturnType<typeof createRouteAuthClient>>;
  actor: ActorRow;
  authUserId: string | null;
  authMode: "cookies" | "bearer" | "internal_bearer";
};

type ResolveActorFail = {
  ok: false;
  status: number;
  error: string;
  stage?: string;
};

type ResolveActorResult = ResolveActorOk | ResolveActorFail;

type EffectivePerms = {
  isSuperAdmin: boolean;
  has: (perm: string) => boolean;
};

type ResolveDelegateArgs = {
  supaRls: Awaited<ReturnType<typeof createRouteAuthClient>>;
  actor: { id: string; role: string | null };
  delegateIdFromQuery?: string | null;
  effectivePerms?: EffectivePerms | null;
};

type CookieToSet = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none" | boolean;
    priority?: "low" | "medium" | "high";
  };
};

export const runtime = "nodejs";

export function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function getEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || !value.trim()) return null;
  return value.trim();
}

function getSupabaseConfig() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") ?? getEnv("SUPABASE_URL");
  const anon =
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? getEnv("SUPABASE_ANON_KEY");
  const service = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anon || !service) {
    throw new Error(
      "Missing SUPABASE env vars (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return { url, anon, service };
}

function createServiceClient() {
  const { url, service } = getSupabaseConfig();

  return createClient(url, service, {
    auth: { persistSession: false },
  });
}

async function createRouteAuthClient(bearerToken?: string | null) {
  const { url, anon } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }));
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // En algunos contextos no se podrá mutar la cookie store.
            // No rompemos el flujo por ello.
          }
        }
      },
    },
    global: bearerToken
      ? {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        }
      : undefined,
  });
}

function getBearerToken(req: Request): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");

  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function lookupActiveActorByAuthUserId(
  supaService: ReturnType<typeof createServiceClient>,
  authUserId: string
): Promise<{ actor: ActorRow | null; error: string | null }> {
  const { data, error } = await supaService
    .from("actors")
    .select("id, role, status, name, email, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    return { actor: null, error: error.message };
  }

  if (!data) {
    return { actor: null, error: "Actor not found" };
  }

  if (String(data.status ?? "").toLowerCase() !== "active") {
    return { actor: null, error: "Actor inactive" };
  }

  return { actor: data as ActorRow, error: null };
}

async function resolveFromCookies(
  _req: Request,
  supaService: ReturnType<typeof createServiceClient>
): Promise<ResolveActorResult | null> {
  try {
    const supaRls = await createRouteAuthClient();
    const { data, error } = await supaRls.auth.getUser();
    const authUserId = data?.user?.id ?? null;

    if (error || !authUserId) {
      return null;
    }

    const actorLookup = await lookupActiveActorByAuthUserId(
      supaService,
      authUserId
    );

    if (actorLookup.error || !actorLookup.actor) {
      return {
        ok: false,
        status: actorLookup.error === "Actor not found" ? 403 : 500,
        error: actorLookup.error ?? "Actor lookup failed",
        stage: "cookies_lookup_actor",
      };
    }

    return {
      ok: true,
      supaService,
      supaRls,
      actor: actorLookup.actor,
      authUserId,
      authMode: "cookies",
    };
  } catch {
    return null;
  }
}

async function resolveFromInternalBearer(
  req: Request,
  supaService: ReturnType<typeof createServiceClient>
): Promise<ResolveActorResult | null> {
  const token = getBearerToken(req);
  const internalBearer = String(
    process.env.VIHOLABS_INTERNAL_BEARER ?? ""
  ).trim();

  if (!token || !internalBearer || token !== internalBearer) {
    return null;
  }

  const { data, error } = await supaService
    .from("actors")
    .select("id, role, status, name, email, auth_user_id")
    .eq("status", "active")
    .in("role", ["SUPER_ADMIN", "super_admin"])
    .limit(1);

  if (error) {
    return {
      ok: false,
      status: 500,
      error: error.message,
      stage: "internal_bearer_actor_lookup",
    };
  }

  const actor = Array.isArray(data)
    ? ((data[0] as ActorRow | undefined) ?? null)
    : null;

  if (!actor) {
    return {
      ok: false,
      status: 403,
      error: "Super admin actor not found",
      stage: "internal_bearer_actor_lookup",
    };
  }

  return {
    ok: true,
    supaService,
    supaRls: await createRouteAuthClient(token),
    actor,
    authUserId: actor.auth_user_id ?? null,
    authMode: "internal_bearer",
  };
}

async function resolveFromBearer(
  req: Request,
  supaService: ReturnType<typeof createServiceClient>
): Promise<ResolveActorResult | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const supaRls = await createRouteAuthClient(token);
  const { data, error } = await supaRls.auth.getUser();
  const authUserId = data?.user?.id ?? null;

  if (error || !authUserId) {
    return {
      ok: false,
      status: 401,
      error: "Invalid token",
      stage: "bearer_validate",
    };
  }

  const actorLookup = await lookupActiveActorByAuthUserId(
    supaService,
    authUserId
  );

  if (actorLookup.error || !actorLookup.actor) {
    return {
      ok: false,
      status: actorLookup.error === "Actor not found" ? 403 : 500,
      error: actorLookup.error ?? "Actor lookup failed",
      stage: "bearer_lookup_actor",
    };
  }

  return {
    ok: true,
    supaService,
    supaRls,
    actor: actorLookup.actor,
    authUserId,
    authMode: "bearer",
  };
}

export async function getActorFromRequest(
  req: Request
): Promise<ResolveActorResult> {
  let stage = "init";

  try {
    const supaService = createServiceClient();

    stage = "cookies_auth";
    const byCookies = await resolveFromCookies(req, supaService);
    if (byCookies) return byCookies;

    stage = "internal_bearer";
    const byInternalBearer = await resolveFromInternalBearer(req, supaService);
    if (byInternalBearer) return byInternalBearer;

    stage = "bearer_auth";
    const byBearer = await resolveFromBearer(req, supaService);
    if (byBearer) return byBearer;

    return {
      ok: false,
      status: 401,
      error: "Authentication required",
      stage: "no_session",
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Server error",
      stage,
    };
  }
}

export async function resolveDelegateIdForActor(
  args: ResolveDelegateArgs
): Promise<string> {
  const { supaRls, actor, delegateIdFromQuery, effectivePerms } = args;

  if (
    delegateIdFromQuery &&
    effectivePerms &&
    (effectivePerms.isSuperAdmin ||
      effectivePerms.has("actors.read") ||
      effectivePerms.has("control_room.delegates.read") ||
      effectivePerms.has("assignments.read"))
  ) {
    return delegateIdFromQuery;
  }

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

  const { data, error } = await supaRls
    .from("delegates")
    .select("id, actor_id, active")
    .eq("actor_id", actor.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("Delegate not found for actor");
  }

  return String(data.id);
}

export async function resolveDelegateIdOrThrow(
  args: ResolveDelegateArgs
): Promise<string> {
  return resolveDelegateIdForActor(args);
}