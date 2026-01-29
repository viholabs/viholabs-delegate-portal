import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getBaseUrl(req: Request) {
  // 1) Preferim env (prod o dev)
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;

  // 2) Fallback per entorns on no està set (no recomanat, però salva)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;

  return "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const { email, next } = (await req.json()) as { email?: string; next?: string };
    if (!email) return json(400, { ok: false, error: "Missing email" });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) return json(500, { ok: false, error: "Missing Supabase env" });

    const supabase = createClient(supabaseUrl, supabaseAnon);

    // sempre path intern segur
    const safeNext =
      typeof next === "string" && next.startsWith("/")
        ? next
        : "/control-room/dashboard";

    const baseUrl = getBaseUrl(req);

    const emailRedirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: false,
      },
    });

    if (error) return json(400, { ok: false, error: error.message });

    return json(200, { ok: true, redirect_to: emailRedirectTo });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Unexpected error" });
  }
}
