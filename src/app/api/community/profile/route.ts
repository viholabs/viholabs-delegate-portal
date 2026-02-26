// src/app/api/community/profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, {
    status,
    headers: {
      // Canon: never cache identity/profile payloads
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

async function safeRead(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  return url;
}

function getAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)");
  return key;
}

function readBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") || "";
  const lower = authHeader.toLowerCase();
  if (!lower.startsWith("bearer ")) return "";
  return authHeader.slice("bearer ".length).trim();
}

/**
 * Canonical auth resolver:
 * 1) Try SSR cookie-based client (preferred).
 * 2) If no user, try Authorization: Bearer <access_token> (fallback for client-localStorage sessions).
 */
async function getAuthedClient(req: NextRequest): Promise<{
  supabase: any;
  userId: string | null;
  authMode: "cookie" | "bearer" | "none";
  authError?: string;
}> {
  // 1) Cookie SSR
  try {
    const supabaseCookie = await createSsrClient();
    const { data, error } = await supabaseCookie.auth.getUser();
    if (!error && data?.user?.id) {
      return { supabase: supabaseCookie, userId: data.user.id, authMode: "cookie" };
    }
  } catch {
    // ignore; fallback to bearer
  }

  // 2) Bearer fallback
  const token = readBearerToken(req);
  if (!token) return { supabase: null, userId: null, authMode: "none", authError: "missing_session" };

  const supabaseBearer = createJsClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseBearer.auth.getUser();
  if (error || !data?.user?.id) {
    return { supabase: supabaseBearer, userId: null, authMode: "none", authError: "invalid_token" };
  }

  return { supabase: supabaseBearer, userId: data.user.id, authMode: "bearer" };
}

export async function GET(req: NextRequest) {
  const a = await getAuthedClient(req);
  if (!a.userId) return json(401, { ok: false, error: "unauthorized" });

  const { data, error } = await a.supabase
    .from("v_community_identity_card_v1")
    .select(
      `
      viholabs_id,
      joined_at,
      user_id,
      display_name,
      aka,
      effective_name,
      company,
      department,
      job_title,
      profile_type,
      avatar_url,
      birthday,
      consent_image_policy
    `
    )
    .eq("user_id", a.userId)
    .limit(1)
    .maybeSingle();

  if (error) return json(500, { ok: false, error: error.message });
  if (!data) return json(404, { ok: false, error: "profile_not_found" });

  return json(200, {
    ok: true,
    profile: {
      aka: data.aka ?? "",
      display_name: data.display_name ?? "",
      company: data.company ?? "",
      profile_type: data.profile_type ?? "",
      birthday: data.birthday ?? null,
      consent_image_policy: Boolean(data.consent_image_policy),
      avatar_url: data.avatar_url ?? "",
      is_internal: data.department != null || data.job_title != null,

      department: data.department ?? "",
      job_title: data.job_title ?? "",
      effective_name: data.effective_name ?? data.display_name ?? "",

      viholabs_id: data.viholabs_id,
      joined_at: data.joined_at,
    },
  });
}

export async function POST(req: NextRequest) {
  const a = await getAuthedClient(req);
  if (!a.userId) return json(401, { ok: false, error: "unauthorized" });

  const body = await safeRead(req);

  const nextAka = typeof body?.aka === "string" ? body.aka.trim() : null;
  const nextDisplayName = typeof body?.display_name === "string" ? body.display_name.trim() : null;

  const wantsConsentTrue = body?.consent_image_policy === true;

  if (nextAka === null && nextDisplayName === null && !wantsConsentTrue) {
    return json(200, { ok: true });
  }

  if (nextDisplayName !== null) {
    const { error } = await a.supabase
      .from("profiles")
      .update({ display_name: nextDisplayName })
      .eq("user_id", a.userId);

    if (error) return json(500, { ok: false, error: error.message });
  }

  if (nextAka !== null || wantsConsentTrue) {
    const patch: any = {};
    if (nextAka !== null) patch.aka = nextAka;
    if (wantsConsentTrue) patch.consent_image_policy = true;

    const { error } = await a.supabase
      .from("user_profile_private")
      .upsert({ user_id: a.userId, ...patch }, { onConflict: "user_id" });

    if (error) return json(500, { ok: false, error: error.message });
  }

  return await GET(req);
}
