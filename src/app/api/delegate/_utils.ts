import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type ActorRow = {
  id: string;
  role: string | null;
  status: string | null;
  name: string | null;
  email: string | null;
  auth_user_id: string | null;
};

type RouteAuthClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type ResolveActorOk = {
  ok: true;
  supaService: ReturnType<typeof createServiceClient>;
  supaRls: RouteAuthClient;
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
  supaRls: RouteAuthClient;
  actor: { id: string; role: string | null };
  delegateIdFromQuery?: string | null;
  effectivePerms?: EffectivePerms | null;
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

function getBearerToken(req: Request): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");

  if (header) {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  // nginx strips Authorization on VPS — fall back to the cookie set by AuthInterceptorProvider
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)viholabs_auth_token=([^;]+)/);
  if (m?.[1]) {
    try { return decodeURIComponent(m[1]).trim(); } catch { return m[1].trim(); }
  }

  return null;
}

function createBearerAuthClient(token: string) {
  const { url, anon } = getSupabaseConfig();

  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
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
  supaService: ReturnType<typeof createServiceClient>
): Promise<ResolveActorResult | null> {
  try {
    const supaRls = await createServerSupabaseClient();
    const { data, error } = await supaRls.auth.getUser();
    const authUserId = data?.user?.id ?? null;

    // Return null (not error) on failure — lets Bearer auth take over
    if (error || !authUserId) return null;

    const actorLookup = await lookupActiveActorByAuthUserId(supaService, authUserId);
    if (actorLookup.error || !actorLookup.actor) return null;

    return { ok: true, supaService, supaRls, actor: actorLookup.actor, authUserId, authMode: "cookies" };
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
    supaRls: (createBearerAuthClient(token) as unknown) as RouteAuthClient,
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

  const supaRls = createBearerAuthClient(token);
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
    supaRls: (supaRls as unknown) as RouteAuthClient,
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

    // Bearer first: reads Authorization header OR viholabs_auth_token cookie
    stage = "bearer_auth";
    const byBearer = await resolveFromBearer(req, supaService);
    if (byBearer) return byBearer;

    stage = "internal_bearer";
    const byInternalBearer = await resolveFromInternalBearer(req, supaService);
    if (byInternalBearer) return byInternalBearer;

    // SSR cookies last: unreliable on VPS/PM2 but kept as final fallback
    stage = "cookies_auth";
    const byCookies = await resolveFromCookies(supaService);
    if (byCookies) return byCookies;

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
      role === "MELQUISEDEC" ||
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
