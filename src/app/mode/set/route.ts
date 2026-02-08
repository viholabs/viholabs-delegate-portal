// src/app/mode/set/route.ts
import { NextResponse } from "next/server";
import { requireCurrentActor } from "@/lib/auth/current-actor";
import {
  MODE_COOKIE,
  normalizeMode,
  pathForMode,
  roleAllowsMode,
  type ModeCode,
} from "@/lib/auth/mode";

export const runtime = "nodejs";

/**
 * En entornos con proxy (codespaces/app.github.dev), req.url puede ser 0.0.0.0.
 * Construimos origin real con x-forwarded-host/proto si existe.
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

export async function POST(req: Request) {
  // 1) Leer mode desde formdata
  const form = await req.formData();
  const modeRaw = form.get("mode");
  const mode = normalizeMode(modeRaw);

  if (!mode) {
    const origin = getRequestOrigin(req);
    return NextResponse.redirect(new URL("/mode?error=invalid_mode", origin), 303);
  }

  // 2) Seguridad: solo permitir modos autorizados por rol
  const actor = await requireCurrentActor();
  if (!roleAllowsMode(actor.role, mode)) {
    const origin = getRequestOrigin(req);
    return NextResponse.redirect(new URL("/dashboard?error=forbidden_mode", origin), 303);
  }

  // 3) Set cookie + redirect al destino del modo (URL ABSOLUTA)
  const origin = getRequestOrigin(req);
  const destination = pathForMode(mode as ModeCode);

  const res = NextResponse.redirect(new URL(destination, origin), 303);

  res.cookies.set({
    name: MODE_COOKIE,
    value: mode,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });

  return res;
}
