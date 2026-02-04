// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "./src/lib/supabase/middleware"; // ✅ ruta REAL, sin alias "@/"

export const runtime = "nodejs";

const PUBLIC_PATHS: string[] = [
  "/login",
  "/auth/callback",
  "/auth/callback-page", // ✅ coherencia con la ruta real
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

const PUBLIC_API_PREFIXES: string[] = [
  "/api/auth", // ej: /api/auth/magic-link
];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"))
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Público: páginas y assets
  if (isPublicPath(pathname)) return NextResponse.next();

  // Público: APIs auth
  if (isPublicApi(pathname)) return NextResponse.next();

  // ✅ Supabase SSR en middleware
  const { supabase, res } = createClient(req);

  const { data } = await supabase.auth.getUser();

  // No logueado -> login con next
  if (!data?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ✅ Ya logueado -> no debe ver /login (Biblia: evitar aterrizajes incorrectos)
  // Redirigimos a "/" porque ahí ya se decide el rol con requireCurrentActor + entryForActor
  if (pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
