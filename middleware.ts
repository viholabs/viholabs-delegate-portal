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

  if (isForbiddenRolePortal(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  let response = NextResponse.next({
    request: req,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          req.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: req,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // viholabs_auth_token is set by the auth callback and readable by JS.
  // Use it as fallback when the Supabase SSR session is unavailable (VPS/PM2).
  const fallbackToken = req.cookies.get("viholabs_auth_token")?.value?.trim() ?? "";

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      // Supabase session missing — try viholabs_auth_token before redirecting.
      if (fallbackToken) {
        const reqHeaders = new Headers(req.headers);
        reqHeaders.set("x-viholabs-token", fallbackToken);
        return NextResponse.next({ request: { headers: reqHeaders } });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "unauthorized");
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Supabase session valid — inject the access token.
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? fallbackToken;
    if (token) {
      const reqHeaders = new Headers(req.headers);
      reqHeaders.set("x-viholabs-token", token);
      const authedResponse = NextResponse.next({ request: { headers: reqHeaders } });
      // Copy session-refresh cookies set by Supabase setAll
      response.cookies.getAll().forEach((c) =>
        authedResponse.cookies.set(c.name, c.value, c)
      );
      // Keep viholabs_auth_token in sync when Supabase rotates the access token
      if (session?.access_token && session.access_token !== fallbackToken) {
        authedResponse.cookies.set("viholabs_auth_token", session.access_token, {
          path: "/",
          httpOnly: false,
          sameSite: "lax",
          secure: req.nextUrl.protocol === "https:",
          maxAge: 3600,
        });
      }
      return authedResponse;
    }

    return response;
  } catch {
    // On error, try fallback token before giving up.
    if (fallbackToken) {
      const reqHeaders = new Headers(req.headers);
      reqHeaders.set("x-viholabs-token", fallbackToken);
      return NextResponse.next({ request: { headers: reqHeaders } });
    }
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