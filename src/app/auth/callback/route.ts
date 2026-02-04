// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entryForActor } from "@/lib/auth/roles";

function safeNext(nextRaw: string | null) {
  if (!nextRaw) return null;
  const v = String(nextRaw).trim();
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v === "/" || v === "/dashboard") return null;
  return v;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "auth_failed");
    return NextResponse.redirect(loginUrl);
  }

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "no_user");
    return NextResponse.redirect(loginUrl);
  }

  const { data: actor, error: aErr } = await supabase
    .from("actors")
    .select("id, role, status, commission_level")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (aErr || !actor || actor.status !== "active") {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "no_actor");
    return NextResponse.redirect(loginUrl);
  }

  const destination = entryForActor({
    role: actor.role,
    commission_level: actor.commission_level,
  });

  const next = safeNext(url.searchParams.get("next"));
  const finalUrl = next ? next : destination;

  return NextResponse.redirect(new URL(finalUrl, url.origin));
}
