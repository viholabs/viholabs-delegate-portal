// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const CANONICAL_ENTRY = "/control-room/dashboard";

function safeNext(nextRaw: string | null) {
  if (!nextRaw) return null;
  const v = String(nextRaw).trim();
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v === "/" || v === "/dashboard") return null;
  return v;
}

/**
 * IMPORTANT (Codespaces / reverse proxy):
 * En entorns amb proxy, url.origin pot ser 0.0.0.0:3000 o localhost.
 * Fem servir x-forwarded-host/proto si existeixen per construir un origin real.
 */
function getRequestOrigin(req: Request) {
  const u = new URL(req.url);

  const xfHost = req.headers.get("x-forwarded-host");
  const xfProto = req.headers.get("x-forwarded-proto");

  if (xfHost) {
    const proto = xfProto || "https";
    return `${proto}://${xfHost}`;
  }

  return u.origin;
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = getRequestOrigin(req);

  const code = url.searchParams.get("code");

  // 1) Client SSR (cookies)
  const supabase = await createSsrClient();

  /**
   * CANÒNIC (Bíblia):
   * /auth/callback ha de suportar:
   * A) code present  -> exchangeCodeForSession(code)
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

  // 2) Usuari autenticat (via sessió existent o via exchange code)
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "auth_required");
    return NextResponse.redirect(loginUrl);
  }

  // 3) Resolver actor amb SERVICE ROLE (NO RLS)
  //    (No canvia el destí final; només valida que existeix i és actiu)
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

    if (!a || a.status !== "active") {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "no_actor");
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "server_misconfigured");
    return NextResponse.redirect(loginUrl);
  }

  // 4) 🔒 DESTÍ FINAL CANÒNIC ÚNIC
  // Si ve un "next" vàlid, el respectem (per deep-links),
  // però el destí per defecte és sempre el mateix per tothom.
  const next = safeNext(url.searchParams.get("next"));
  const finalPath = next ? next : CANONICAL_ENTRY;

  return NextResponse.redirect(new URL(finalPath, origin));
}
