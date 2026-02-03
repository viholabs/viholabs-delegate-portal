// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * FIX: el middleware NO debe interceptar /api/*
 * Si lo intercepta, puede responder con redirect HTML (login) y el frontend verá "Respuesta no-JSON".
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ 1) Nunca tocar APIs
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ✅ 2) Nunca tocar assets de Next / estáticos
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public/")
  ) {
    return NextResponse.next();
  }

  // ✅ 3) Rutas públicas (ajusta si quieres)
  const PUBLIC_PATHS = new Set<string>([
    "/",
    "/login",
    "/logout",
    "/auth/callback",
    "/import", // si quieres permitir abrir /import (la auth real ya se controla en UI)
  ]);

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Si tu middleware hacía checks adicionales (cookies, etc.),
  // aquí NO invento auth, solo evito romper /api y HTML no-json.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
