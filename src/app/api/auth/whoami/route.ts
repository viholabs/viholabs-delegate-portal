// src/app/api/auth/whoami/route.ts

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  /* ✅ Next 15 — REQUIRED AWAIT */
  const cookieStore = await cookies();
  const headerStore = await headers();

  const viholabs_mode = cookieStore.get("viholabs_mode")?.value ?? null;
  const viholabs_role = cookieStore.get("viholabs_role")?.value ?? null;

  const xfHost = headerStore.get("x-forwarded-host");
  const xfProto = headerStore.get("x-forwarded-proto");
  const host = headerStore.get("host");

  const supabase = await createSsrClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  let actor = null;
  let actor_error: string | null = null;

  if (user?.id) {
    try {
      const admin = getAdminSupabase();

      const { data: a, error } = await admin
        .from("actors")
        .select("id, role, status, commission_level")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (error) actor_error = error.message;
      actor = a ?? null;
    } catch (e: any) {
      actor_error = e?.message ?? "actor_lookup_failed";
    }
  }

  return NextResponse.json({
    ok: true,
    request: { host, xfHost, xfProto },
    cookies: { viholabs_mode, viholabs_role },
    auth: {
      has_user: Boolean(user),
      user_id: user?.id ?? null,
      email: user?.email ?? null,
    },
    actor,
    actor_error,
  });
}
