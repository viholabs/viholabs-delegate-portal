import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/favicon.ico", "/robots.txt", "/sitemap.xml"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static passthrough
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/images") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  ) {
    return NextResponse.next();
  }

  // Public routes
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Prohibimos / y /dashboard como destino final
  const requestedIsBad = pathname === "/" || pathname === "/dashboard";
  const defaultAfterLogin = "/control-room/dashboard";
  const targetPath = requestedIsBad ? defaultAfterLogin : pathname;

  // Response que mutaremos con cookies
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options as any);
          });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  // No session => login + next
  if (!data?.user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", targetPath);
    return NextResponse.redirect(loginUrl);
  }

  // Con sesión, si cae en / o /dashboard => mándalo al destino definitivo
  if (requestedIsBad) {
    const fixed = req.nextUrl.clone();
    fixed.pathname = defaultAfterLogin;
    fixed.search = "";
    return NextResponse.redirect(fixed);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
