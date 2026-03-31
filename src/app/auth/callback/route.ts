// src/app/auth/callback/route.ts

/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Actor: VIHOLABS_AUTH_AGENT
 * Reason: Canonical entry + mode semantics — set viholabs_mode AND viholabs_role from actor; never land on /mode
 * Scope: Auth callback redirect + cookies set (no UI changes)
 */

import { NextResponse } from "next/server";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { MODE_COOKIE, normalizeMode, roleAllowsMode, type ModeCode } from "@/lib/auth/mode";
import { entryForActor } from "@/lib/auth/roles";

const ROLE_COOKIE = "viholabs_role";

function safeNext(nextRaw: string | null) {
  if (!nextRaw) return null;
  const v = String(nextRaw).trim();

  // només paths interns
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;

  // no permetre entrades trivials / antigues
  if (v === "/" || v === "/dashboard") return null;

  // legacy explícit
  if (v === "/control-room/dashboard") return null;

  // /mode mai pot ser landing (ni via next)
  if (v === "/mode" || v.startsWith("/mode/")) return null;

  return v;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * IMPORTANT (prod / reverse proxy):
 * Sempre prioritzem una base URL canònica pública.
 * No confiem en req.url.origin si pot arribar com 0.0.0.0:3000 o localhost.
 */
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

/**
 * Canonical mapping: role -> default mode (state / lens)
 * IMPORTANT: Mode ≠ portal. Mode is only a reading lens inside the single Shell.
 */
function defaultModeForRole(roleRaw: unknown): ModeCode {
  const role = String(roleRaw ?? "").trim().toUpperCase();

  // Client lens
  if (role === "CLIENT") return "client";

  // Delegate lens (operativa / relacional)
  if (role === "DELEGATE" || role === "KOL" || role === "COMMISSION_AGENT" || role === "DISTRIBUTOR") {
    return "delegate";
  }

  // Control Room lens (govern / supervisió)
  return "control-room";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = getRequestOrigin(req);

  const code = url.searchParams.get("code");

  // 1) Client SSR (cookies)
  const supabase = await createSsrClient();

  /**
   * CANÒNIC:
   * A) code present  -> exchangeCodeForSession(code)  (magic link / oauth)
   * B) code absent   -> sessió ja existent (email+password SSR) i continuar
   */
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "auth_failed");
      return NextResponse.redirect(loginUrl);
    }
  }

  // 2) Usuari autenticat
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "auth_required");
    return NextResponse.redirect(loginUrl);
  }

  // 3) Resolver actor amb SERVICE ROLE (NO RLS)
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
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "actor_lookup_failed");
      return NextResponse.redirect(loginUrl);
    }

    if (!a) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "no_actor");
      return NextResponse.redirect(loginUrl);
    }

    actorRole = a.role;
    actorStatus = a.status;
    actorCommissionLevel = a.commission_level;

    if (String(actorStatus).toLowerCase() !== "active") {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "no_actor");
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "server_misconfigured");
    return NextResponse.redirect(loginUrl);
  }

  // 4) Mode (state) a partir de rol
  const requestedMode = normalizeMode(url.searchParams.get("mode"));
  const fallbackMode = defaultModeForRole(actorRole);

  const modeToSet: ModeCode =
    requestedMode && roleAllowsMode(actorRole, requestedMode) ? requestedMode : fallbackMode;

  // 5) Destí final (Shell institucional únic per defecte)
  const next = safeNext(url.searchParams.get("next"));
  const actorEntry = entryForActor({ role: actorRole, commission_level: actorCommissionLevel });
  const finalPath = next ? next : actorEntry || "/control-room/shell";

  const res = NextResponse.redirect(new URL(finalPath, origin));

  // 6) Cookies canòniques (UI lens + rol real)
  const secure = origin.startsWith("https://");

  res.cookies.set(MODE_COOKIE, modeToSet, {
    path: "/",
    httpOnly: false, // UI needs it
    sameSite: "lax",
    secure,
  });

  // ✅ rol real del sistema per filtrar tabs correctament
  res.cookies.set(ROLE_COOKIE, String(actorRole ?? "").trim().toUpperCase(), {
    path: "/",
    httpOnly: false, // UI needs it
    sameSite: "lax",
    secure,
  });

  return res;
}