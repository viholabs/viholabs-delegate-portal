import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

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

function isJsonRequest(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("application/json");
}

async function readCredentials(req: Request): Promise<{
  email: string;
  password: string;
  mode: "json" | "form";
}> {
  if (isJsonRequest(req)) {
    const body = (await req.json()) as { email?: unknown; password?: unknown };

    return {
      email: typeof body?.email === "string" ? body.email.trim() : "",
      password: typeof body?.password === "string" ? body.password : "",
      mode: "json",
    };
  }

  const form = await req.formData();

  return {
    email: typeof form.get("email") === "string" ? String(form.get("email")).trim() : "",
    password: typeof form.get("password") === "string" ? String(form.get("password")) : "",
    mode: "form",
  };
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function redirectToLogin(req: Request, errorCode: string) {
  const origin = getRequestOrigin(req);
  const url = new URL("/login", origin);
  url.searchParams.set("error", errorCode);
  return NextResponse.redirect(url);
}

function redirectToCallback(req: Request) {
  const origin = getRequestOrigin(req);
  return NextResponse.redirect(new URL("/auth/callback", origin));
}

export async function POST(req: Request) {
  try {
    const { email, password, mode } = await readCredentials(req);

    if (!email || !password) {
      if (mode === "form") {
        return redirectToLogin(req, "missing_credentials");
      }

      return json(400, { ok: false, error: "missing_credentials" });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      if (mode === "form") {
        return redirectToLogin(req, "missing_supabase_env");
      }

      return json(500, { ok: false, error: "missing_supabase_env" });
    }

    const cookieStore = await cookies();

    const jsonResponse = NextResponse.json({ ok: true }, { status: 200 });
    const redirectResponse = redirectToCallback(req);

    const response = mode === "form" ? redirectResponse : jsonResponse;

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const c of cookiesToSet) {
            response.cookies.set(c.name, c.value, c.options);
          }
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (mode === "form") {
        return redirectToLogin(req, "auth_failed");
      }

      return json(401, {
        ok: false,
        error: "auth_failed",
        message: error.message,
      });
    }

    if (!data?.session) {
      if (mode === "form") {
        return redirectToLogin(req, "no_session");
      }

      return json(401, { ok: false, error: "no_session" });
    }

    return response;
  } catch (err: any) {
    const mode = isJsonRequest(req) ? "json" : "form";

    if (mode === "form") {
      return redirectToLogin(req, "server_error");
    }

    return json(500, {
      ok: false,
      error: "server_error",
      message: err?.message ?? "unknown",
    });
  }
}