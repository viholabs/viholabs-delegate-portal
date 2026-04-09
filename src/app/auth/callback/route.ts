// src/app/auth/callback/route.ts

/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Actor: VIHOLABS_AUTH_AGENT
 * Reason: Canonical entry + mode semantics — set viholabs_mode AND viholabs_role from actor; never land on /mode
 * Scope: Auth callback redirect + cookies set (no UI changes)
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  MODE_COOKIE,
  normalizeMode,
  roleAllowsMode,
  type ModeCode,
} from "@/lib/auth/mode";
import { entryForActor } from "@/lib/auth/roles";

const ROLE_COOKIE = "viholabs_role";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function safeNext(nextRaw: string | null) {
  if (!nextRaw) return null;
  const v = String(nextRaw).trim();

  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;

  if (v === "/" || v === "/dashboard") return null;
  if (v === "/control-room/dashboard") return null;
  if (v === "/mode" || v.startsWith("/mode/")) return null;

  return v;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getRequestOrigin(req: Request) {
  const envSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envSite) return stripTrailingSlash(envSite);

  const envBase = process.env.APP_BASE_URL?.trim();
  if (envBase) return stripTrailingSlash(envBase);

  const envApp = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envApp) return stripTrailingSlash(envApp);

  const xfHost = req.headers.get("x-forwarded-host");
  const xfProto = req.headers.get("x-forwarded-proto") || "https";

  if (xfHost) {
    return `${xfProto}://${xfHost}`;
  }

  const host = req.headers.get("host");
  if (host) {
    return `${xfProto}://${host}`;
  }

  return stripTrailingSlash(new URL(req.url).origin);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

function getSupabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY"
    );
  }

  return { url, anon };
}

function defaultModeForRole(roleRaw: unknown): ModeCode {
  const role = String(roleRaw ?? "").trim().toUpperCase();

  if (role === "CLIENT") return "client";

  if (
    role === "DELEGATE" ||
    role === "KOL" ||
    role === "COMMISSION_AGENT" ||
    role === "DISTRIBUTOR"
  ) {
    return "delegate";
  }

  return "control-room";
}

function redirectToLogin(origin: string, errorCode: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", errorCode);
  return NextResponse.redirect(loginUrl);
}

function createRouteSupabase(req: Request, response: NextResponse) {
  const { url, anon } = getSupabaseAuthConfig();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        const cookieHeader = req.headers.get("cookie") ?? "";
        if (!cookieHeader.trim()) return [];

        return cookieHeader
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const idx = part.indexOf("=");
            if (idx === -1) return { name: part, value: "" };

            const name = part.slice(0, idx).trim();
            const value = part.slice(idx + 1).trim();

            try {
              return { name, value: decodeURIComponent(value) };
            } catch {
              return { name, value };
            }
          })
          .filter((cookie) => cookie.name.length > 0);
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = getRequestOrigin(req);

  const requestedNext = safeNext(url.searchParams.get("next"));
  const provisionalPath = requestedNext || "/control-room/shell";
  const response = NextResponse.redirect(new URL(provisionalPath, origin));

  const supabase = createRouteSupabase(req, response);
  const code = url.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectToLogin(origin, "auth_failed");
    }
  }

  const { data, error: userError } = await supabase.auth.getUser();
  const user = data?.user;

  if (userError || !user) {
    return redirectToLogin(origin, "auth_required");
  }

  let actorRole: unknown = null;
  let actorStatus: unknown = null;
  let actorCommissionLevel: unknown = null;

  try {
    const admin = getAdminSupabase();
    const { data: a, error: aErr } = await admin
      .from("actors")
      .select("id, role, status, commission_level")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (aErr) {
      return redirectToLogin(origin, "actor_lookup_failed");
    }

    if (!a) {
      return redirectToLogin(origin, "no_actor");
    }

    actorRole = a.role;
    actorStatus = a.status;
    actorCommissionLevel = a.commission_level;

    if (String(actorStatus).toLowerCase() !== "active") {
      return redirectToLogin(origin, "no_actor");
    }
  } catch {
    return redirectToLogin(origin, "server_misconfigured");
  }

  const requestedMode = normalizeMode(url.searchParams.get("mode"));
  const fallbackMode = defaultModeForRole(actorRole);

  const modeToSet: ModeCode =
    requestedMode && roleAllowsMode(actorRole, requestedMode)
      ? requestedMode
      : fallbackMode;

  const actorEntry = entryForActor({
    role: actorRole,
    commission_level: actorCommissionLevel,
  });

  const finalPath = requestedNext || actorEntry || "/control-room/shell";
  response.headers.set("Location", new URL(finalPath, origin).toString());

  const secure = origin.startsWith("https://");

  response.cookies.set(MODE_COOKIE, modeToSet, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure,
  });

  response.cookies.set(ROLE_COOKIE, String(actorRole ?? "").trim().toUpperCase(), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure,
  });

  return response;
}