import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getBaseUrl(req: Request) {
  const envSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envSite) return stripTrailingSlash(envSite);

  const envBase = process.env.APP_BASE_URL?.trim();
  if (envBase) return stripTrailingSlash(envBase);

  const envApp = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envApp) return stripTrailingSlash(envApp);

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";

  if (host) return `${proto}://${host}`;

  throw new Error("Cannot resolve base URL for auth magic link");
}

function sanitizeNext(next: unknown) {
  if (typeof next !== "string") return "/control-room/shell";

  const value = next.trim();

  if (!value.startsWith("/")) return "/control-room/shell";
  if (value.startsWith("//")) return "/control-room/shell";
  if (value === "/") return "/control-room/shell";
  if (value === "/dashboard") return "/control-room/shell";
  if (value === "/control-room/dashboard") return "/control-room/shell";

  return value;
}

export async function POST(req: Request) {
  try {
    const { email, next } = (await req.json()) as {
      email?: string;
      next?: string;
    };

    if (!email) {
      return json(400, { ok: false, error: "Missing email" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnon) {
      return json(500, { ok: false, error: "Missing Supabase env" });
    }

    const supabase = createClient(supabaseUrl, supabaseAnon);

    const safeNext = sanitizeNext(next);
    const baseUrl = getBaseUrl(req);

    const emailRedirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(
      safeNext
    )}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: false,
      },
    });

    if (error) {
      return json(400, { ok: false, error: error.message });
    }

    return json(200, { ok: true, redirect_to: emailRedirectTo });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Unexpected error" });
  }
}