// src/app/logout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getPublicOrigin(req: Request) {
  const h = req.headers;

  const proto =
    h.get("x-forwarded-proto") ||
    (h.get("host")?.startsWith("localhost") ? "http" : "https") ||
    "https";

  const host =
    h.get("x-forwarded-host") ||
    h.get("host") ||
    "";

  if (!host) {
    // Fallback extremo: usar req.url aunque venga raro
    return new URL(req.url).origin;
  }

  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  // 1) Cerrar sesión (cookies SSR)
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // aunque falle, redirigimos igual
  }

  // 2) Redirect robusto (Codespaces / proxy / prod)
  const origin = getPublicOrigin(req);
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("logged_out", "true");

  return NextResponse.redirect(loginUrl);
}
