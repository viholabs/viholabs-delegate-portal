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

function parseCookies(header: string): { name: string; value: string }[] {
  return header.split(";").map(p => p.trim()).filter(Boolean).map(p => {
    const i = p.indexOf("=");
    if (i === -1) return { name: p, value: "" };
    const name = p.slice(0, i).trim();
    const raw = p.slice(i + 1).trim();
    try { return { name, value: decodeURIComponent(raw) }; } catch { return { name, value: raw }; }
  }).filter(c => c.name.length > 0);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = getRequestOrigin(req);
  const secure = origin.startsWith("https://");
  const requestedNext = safeNext(url.searchParams.get("next"));

  // Collect every cookie Supabase wants to write during the exchange.
  // Written directly to the final redirectResponse — no intermediate copy.
  const pendingCookies: CookieToSet[] = [];

  const { url: sbUrl, anon } = getSupabaseAuthConfig();
  const supabase = createServerClient(sbUrl, anon, {
    cookies: {
      getAll: () => parseCookies(req.headers.get("cookie") ?? ""),
      setAll: (list: CookieToSet[]) => { pendingCookies.push(...list); },
    },
  });

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectToLogin(origin, "auth_failed");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) return redirectToLogin(origin, "session_missing");

  const { data, error: userError } = await supabase.auth.getUser();
  const user = data?.user;
  if (userError || !user) return redirectToLogin(origin, "auth_required");

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

    if (aErr) return redirectToLogin(origin, "actor_lookup_failed");
    if (!a) return redirectToLogin(origin, "no_actor");

    actorRole = a.role;
    actorStatus = a.status;
    actorCommissionLevel = a.commission_level;

    if (String(actorStatus).toLowerCase() !== "active") return redirectToLogin(origin, "no_actor");
  } catch {
    return redirectToLogin(origin, "server_misconfigured");
  }

  const requestedMode = normalizeMode(url.searchParams.get("mode"));
  const fallbackMode = defaultModeForRole(actorRole);
  const modeToSet: ModeCode =
    requestedMode && roleAllowsMode(actorRole, requestedMode) ? requestedMode : fallbackMode;

  const actorEntry = entryForActor({ role: actorRole, commission_level: actorCommissionLevel });
  const finalPath = requestedNext || actorEntry || "/control-room/shell";
  const finalUrl = new URL(finalPath, origin);

  const redirectResponse = NextResponse.redirect(finalUrl, { status: 302 });

  // 1. Supabase session cookies (collected during exchangeCodeForSession + getSession)
  for (const { name, value, options } of pendingCookies) {
    redirectResponse.cookies.set(name, value, options ?? {});
  }

  // 2. viholabs_auth_token — JS-readable bearer token for middleware + API routes
  redirectResponse.cookies.set("viholabs_auth_token", sessionData.session.access_token, {
    path: "/", httpOnly: false, sameSite: "lax", secure, maxAge: 3600,
  });

  // 3. Mode and role for client-side routing
  redirectResponse.cookies.set(MODE_COOKIE, modeToSet, {
    path: "/", httpOnly: false, sameSite: "lax", secure,
  });
  redirectResponse.cookies.set(ROLE_COOKIE, String(actorRole ?? "").trim().toUpperCase(), {
    path: "/", httpOnly: false, sameSite: "lax", secure,
  });

  console.log("[AUTH CALLBACK] cookies on redirect:", redirectResponse.cookies.getAll().map(c => c.name));
  return redirectResponse;
}