// src/app/api/community/profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";

function getServiceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

function createServiceClient() {
  return createJsClient(getSupabaseUrl(), getServiceKey(), {
    auth: { persistSession: false },
  });
}

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, {
    status,
    headers: {
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
  if (!url) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  }
  return url;
}

function getAnonKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)"
    );
  }
  return key;
}

function readBearerToken(req: NextRequest): string {
  // 1. Authorization header (may be stripped by nginx on VPS)
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const t = authHeader.slice("bearer ".length).trim();
    if (t) return t;
  }

  // 2. viholabs_auth_token cookie — set by AuthInterceptorProvider, never stripped by nginx
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)viholabs_auth_token=([^;]+)/);
  if (m?.[1]) {
    try { return decodeURIComponent(m[1]).trim(); } catch { return m[1].trim(); }
  }

  return "";
}

async function getAuthedClient(req: NextRequest): Promise<{
  supabase: any;
  userId: string | null;
  authMode: "cookie" | "bearer" | "none";
  authError?: string;
}> {
  // Bearer first (reads Authorization header OR viholabs_auth_token cookie).
  // Reliable on VPS — cookies are never stripped by nginx.
  const token = readBearerToken(req);
  if (token) {
    const supabaseBearer = createJsClient(getSupabaseUrl(), getAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabaseBearer.auth.getUser();
    if (!error && data?.user?.id) {
      return { supabase: supabaseBearer, userId: data.user.id, authMode: "bearer" };
    }
  }

  // Fallback: SSR cookie client (works locally, unreliable on VPS with PM2)
  try {
    const supabaseCookie = await createSsrClient();
    const { data, error } = await supabaseCookie.auth.getUser();
    if (!error && data?.user?.id) {
      return { supabase: supabaseCookie, userId: data.user.id, authMode: "cookie" };
    }
  } catch { /* ignore */ }

  return { supabase: null, userId: null, authMode: "none", authError: "missing_session" };
}

export async function GET(req: NextRequest) {
  const a = await getAuthedClient(req);

  if (!a.userId) {
    return json(401, { ok: false, error: "unauthorized" });
  }

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

  if (error) {
    return json(500, { ok: false, error: error.message });
  }

  const supaService = createServiceClient();
  const { data: actorRow, error: actorError } = await supaService
    .from("actors")
    .select("id, role, status")
    .eq("auth_user_id", a.userId)
    .limit(1)
    .maybeSingle();

  if (actorError) {
    return json(500, { ok: false, error: actorError.message });
  }

  if (!data) {
    return json(404, { ok: false, error: "profile_not_found" });
  }

  const role = String(actorRow?.role ?? "").trim().toLowerCase();
  const effectiveActorId =
    actorRow?.id != null ? String(actorRow.id) : null;

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

      effective_actor_id: effectiveActorId,
      actor_id: effectiveActorId,
      role,
      is_melquisedec: role === "melquisedec",
    },
  });
}

export async function POST(req: NextRequest) {
  const a = await getAuthedClient(req);

  if (!a.userId) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const body = await safeRead(req);

  const nextAka = typeof body?.aka === "string" ? body.aka.trim() : null;
  const nextDisplayName =
    typeof body?.display_name === "string" ? body.display_name.trim() : null;
  const wantsConsentTrue = body?.consent_image_policy === true;

  if (nextAka === null && nextDisplayName === null && !wantsConsentTrue) {
    return json(200, { ok: true });
  }

  if (nextDisplayName !== null) {
    const { error } = await a.supabase
      .from("profiles")
      .update({ display_name: nextDisplayName })
      .eq("user_id", a.userId);

    if (error) {
      return json(500, { ok: false, error: error.message });
    }
  }

  if (nextAka !== null || wantsConsentTrue) {
    const patch: any = {};
    if (nextAka !== null) patch.aka = nextAka;
    if (wantsConsentTrue) patch.consent_image_policy = true;

    const { error } = await a.supabase
      .from("user_profile_private")
      .upsert({ user_id: a.userId, ...patch }, { onConflict: "user_id" });

    if (error) {
      return json(500, { ok: false, error: error.message });
    }
  }

  return await GET(req);
}