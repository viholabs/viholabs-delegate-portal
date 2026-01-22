import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(`${url.origin}/login`, { status: 303 });
}

// (Opcional) permitir logout por GET si lo usas como link
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(`${url.origin}/login`, { status: 303 });
}
