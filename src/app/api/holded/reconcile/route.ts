// src/app/logout/route.ts
/**
 * VIHOLABS — Logout
 * Canon: this route logs the user out from Supabase auth and redirects to /login.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();

  // Best-effort logout; even if it fails, redirect to login.
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }

  const url = new URL(req.url);
  return NextResponse.redirect(new URL("/login", url.origin));
}

export async function POST(req: Request) {
  return GET(req);
}
