import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { entryForActor } from "@/lib/auth/roles";
import {
  MODE_COOKIE,
  normalizeMode,
  roleAllowsMode,
  type ModeCode,
} from "@/lib/auth/mode";

export const runtime = "nodejs";

const ROLE_COOKIE = "viholabs_role";

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
  if (xfHost) return `${xfProto}://${xfHost}`;

  const host = req.headers.get("host");
  if (host) return `${xfProto}://${host}`;

  return stripTrailingSlash(new URL(req.url).origin);
}

function isJsonRequest(req: Request) {
  const ct = req.headers.get("content-type") || "";
  return ct.toLowerCase().includes("application/json");
}

async function readCredentials(req: Request) {
  if (isJsonRequest(req)) {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    return {
      email: typeof body?.email === "string" ? body.email.trim() : "",
      password: typeof body?.password === "string" ? body.password : "",
      mode: "json" as const,
    };
  }
  const form = await req.formData();
  return {
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
    mode: "form" as const,
  };
}

function redirectToLogin(req: Request, errorCode: string) {
  const origin = getRequestOrigin(req);
  const url = new URL("/login", origin);
  url.searchParams.set("error", errorCode);
  return NextResponse.redirect(url, { status: 303 });
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function defaultModeForRole(roleRaw: unknown): ModeCode {
  const role = String(roleRaw ?? "").trim().toUpperCase();
  if (role === "CLIENT") return "client";
  if (["DELEGATE", "KOL", "COMMISSION_AGENT", "DISTRIBUTOR"].includes(role)) return "delegate";
  return "control-room";
}

export async function POST(req: Request) {
  const mode = isJsonRequest(req) ? "json" : "form";

  try {
    const { email, password } = await readCredentials(req);

    if (!email || !password) {
      return mode === "form"
        ? redirectToLogin(req, "missing_credentials")
        : json(400, { ok: false, error: "missing_credentials" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return mode === "form"
        ? redirectToLogin(req, "missing_supabase_env")
        : json(500, { ok: false, error: "missing_supabase_env" });
    }

    // Sign in with the anon client — gets fresh session directly
    const anonClient = createAdminClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData?.session) {
      return mode === "form"
        ? redirectToLogin(req, "auth_failed")
        : json(401, { ok: false, error: "auth_failed", message: authError?.message ?? "no session" });
    }

    const session = authData.session;
    const authUserId = session.user.id;

    // Look up actor with admin client
    const adminClient = createAdminClient(supabaseUrl, supabaseService, {
      auth: { persistSession: false },
    });

    const { data: actor, error: actorError } = await adminClient
      .from("actors")
      .select("id, role, status, commission_level")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (actorError || !actor) {
      return mode === "form"
        ? redirectToLogin(req, "no_actor")
        : json(403, { ok: false, error: "no_actor" });
    }

    if (String(actor.status ?? "").toLowerCase() !== "active") {
      return mode === "form"
        ? redirectToLogin(req, "no_actor")
        : json(403, { ok: false, error: "actor_inactive" });
    }

    const origin = getRequestOrigin(req);
    const secure = origin.startsWith("https://");

    // Determine mode: respect ?mode= param if allowed, else default
    const requestedMode = normalizeMode(new URL(req.url).searchParams.get("mode"));
    const fallbackMode = defaultModeForRole(actor.role);
    const modeToSet: ModeCode =
      requestedMode && roleAllowsMode(actor.role, requestedMode) ? requestedMode : fallbackMode;

    const actorEntry = entryForActor({ role: actor.role, commission_level: actor.commission_level });
    const finalPath = actorEntry ?? "/control-room/shell";
    const finalUrl = new URL(finalPath, origin);

    if (mode === "json") {
      const response = json(200, { ok: true, redirect: finalPath });
      response.cookies.set("viholabs_auth_token", session.access_token, {
        path: "/", httpOnly: false, sameSite: "lax", secure, maxAge: 3600,
      });
      response.cookies.set(MODE_COOKIE, modeToSet, { path: "/", httpOnly: false, sameSite: "lax", secure });
      response.cookies.set(ROLE_COOKIE, String(actor.role ?? "").trim().toUpperCase(), { path: "/", httpOnly: false, sameSite: "lax", secure });
      return response;
    }

    // Form: redirect directly to the portal with all cookies set here
    const redirectResponse = NextResponse.redirect(finalUrl, { status: 303 });

    redirectResponse.cookies.set("viholabs_auth_token", session.access_token, {
      path: "/", httpOnly: false, sameSite: "lax", secure, maxAge: 3600,
    });
    redirectResponse.cookies.set(MODE_COOKIE, modeToSet, {
      path: "/", httpOnly: false, sameSite: "lax", secure,
    });
    redirectResponse.cookies.set(ROLE_COOKIE, String(actor.role ?? "").trim().toUpperCase(), {
      path: "/", httpOnly: false, sameSite: "lax", secure,
    });

    console.log("[AUTH/PASSWORD] login ok:", email, "| role:", actor.role, "| mode:", modeToSet, "| redirect:", finalPath);

    return redirectResponse;

  } catch (err: unknown) {
    console.error("[AUTH/PASSWORD] unexpected error:", err);
    return mode === "form"
      ? redirectToLogin(req, "server_error")
      : json(500, { ok: false, error: "server_error" });
  }
}
