// middleware.ts

/**
 * AUDIT TRACE
 * Date: 2026-03-09
 * Actor: CHATGPT
 * Reason: Canonical auth routing guard for root entry and login flows
 * Scope: Routing/auth guard only. No business logic, no data mutations.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

const PUBLIC_PATHS: string[] = [
  "/login",
  "/logout",
  "/auth/callback",
  "/auth/callback-page",
  "/auth/password",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/public") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

function isForbiddenRolePortal(pathname: string) {
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

  // 0) Canon guard: no portals by role
  if (isForbiddenRolePortal(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 1) Public auth/static routes pass through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  const res = NextResponse.next();

  try {
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "unauthorized");
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return res;
  } catch {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "session_check_failed");
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};