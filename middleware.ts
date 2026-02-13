// middleware.ts
/**
 * AUDIT TRACE
 * Date: 2026-02-13
 * Reason: Canonical routing guard — forbid role portals (/delegate, /client, /kol, /commercial)
 * Scope: Routing only. No backend/data changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

const PUBLIC_PATHS: string[] = [
  "/login",
  "/auth/callback",
  "/logout",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function isForbiddenRolePortal(pathname: string) {
  // Canon: no portals/layouts by role.
  return (
    pathname === "/delegate" ||
    pathname.startsWith("/delegate/") ||
    pathname === "/client" ||
    pathname.startsWith("/client/") ||
    pathname === "/kol" ||
    pathname.startsWith("/kol/") ||
    pathname === "/commercial" ||
    pathname.startsWith("/commercial/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 0) Canon guard: hard 404 on forbidden role portals
  if (isForbiddenRolePortal(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 1) Públicos → pasar
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  // 2) Creamos response para poder setear cookies si Supabase lo necesita
  const res = NextResponse.next();

  // 3) Cliente SSR (cookies)
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // 4) Sesión (solo esto; NO roles, NO actor)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
