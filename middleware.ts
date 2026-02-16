// middleware.ts
/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Reason: Canonical routing guard + API honesty:
 *   - Forbid role portals (/delegate, /client, /kol, /commercial)
 *   - UI routes may redirect to /login (HTML)
 *   - API routes (/api/*) must NEVER redirect to HTML login/callback. They must be consumable as APIs.
 *   - Institutional UI areas require viholabs_mode cookie (mode is state/lens, not portal).
 * Scope: Routing only. No backend/data changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

const MODE_COOKIE = "viholabs_mode";

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

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
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

/**
 * Zones institucionals UI que NO poden operar sense mode cookie.
 * (Mode = estat/lent dins del Shell únic, no portal.)
 */
function isInstitutionalUiArea(pathname: string) {
  return (
    pathname.startsWith("/control-room") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/commissions")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 0) Canon guard: hard 404 on forbidden role portals
  if (isForbiddenRolePortal(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 1) Public paths → pass
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2) ✅ API honesty: /api/* must never redirect to HTML login/callback.
  // Let each API route handle auth and return JSON status codes.
  if (isApiPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  // 3) Prepare response to allow Supabase to set cookies if needed
  const res = NextResponse.next();

  // 4) SSR client (cookies)
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

  // 5) Session (only user; no roles/actor here)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(loginUrl);
  }

  // 6) Institutional UI requires mode cookie; if missing, go to auth/callback to resolve actor+mode.
  if (isInstitutionalUiArea(pathname)) {
    const mode = req.cookies.get(MODE_COOKIE)?.value;

    if (!mode) {
      const cb = req.nextUrl.clone();
      cb.pathname = "/auth/callback";
      cb.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(cb);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};