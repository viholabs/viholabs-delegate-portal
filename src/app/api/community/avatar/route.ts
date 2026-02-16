// src/app/api/community/avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !service) return null;
  return createAdminClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return { ok: false as const, user_id: null };
  return { ok: true as const, user_id: data.user.id };
}

async function ensureConsent(user_id: string) {
  const supabase = await createClient();

  // leemos consentimiento desde user_profile_private
  const { data, error } = await supabase
    .from("user_profile_private")
    .select("consent_image_policy")
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) return { ok: false as const, consent: false, reason: "db_error" };
  const consent = Boolean(data?.consent_image_policy);

  return { ok: true as const, consent, reason: consent ? "ok" : "no_consent" };
}

function isImageMime(mime: string) {
  const m = String(mime || "").toLowerCase();
  return m === "image/png" || m === "image/jpeg" || m === "image/webp";
}

function toDataUrl(mime: string, buf: Buffer) {
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

async function updateAvatarUrl(user_id: string, avatar_url: string) {
  // 1) Intento RLS (usuario)
  const supabase = await createClient();
  const r1 = await supabase
    .from("user_profile_private")
    .update({ avatar_url, updated_at: new Date().toISOString() })
    .eq("user_id", user_id)
    .select("avatar_url")
    .maybeSingle();

  if (!r1.error && r1.data?.avatar_url) {
    return { ok: true as const, avatar_url: String(r1.data.avatar_url) };
  }

  // 2) Fallback admin (si existe service role)
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false as const,
      error: r1.error?.message || "No permission to update avatar_url (no admin client).",
    };
  }

  const r2 = await admin
    .from("user_profile_private")
    .update({ avatar_url, updated_at: new Date().toISOString() })
    .eq("user_id", user_id)
    .select("avatar_url")
    .maybeSingle();

  if (r2.error || !r2.data?.avatar_url) {
    return { ok: false as const, error: r2.error?.message || "Failed to update avatar_url." };
  }

  return { ok: true as const, avatar_url: String(r2.data.avatar_url) };
}

async function clearAvatarUrl(user_id: string) {
  const supabase = await createClient();
  const r1 = await supabase
    .from("user_profile_private")
    .update({ avatar_url: "", updated_at: new Date().toISOString() })
    .eq("user_id", user_id)
    .select("avatar_url")
    .maybeSingle();

  if (!r1.error) return { ok: true as const };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false as const, error: r1.error?.message || "No permission." };

  const r2 = await admin
    .from("user_profile_private")
    .update({ avatar_url: "", updated_at: new Date().toISOString() })
    .eq("user_id", user_id);

  if (r2.error) return { ok: false as const, error: r2.error.message };
  return { ok: true as const };
}

/**
 * POST /api/community/avatar
 * Body: multipart/form-data, field "file"
 * Returns: { ok:true, avatar_url }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedUserId();
    if (!auth.ok || !auth.user_id) return json(401, { ok: false, error: "unauthorized" });

    const consentRes = await ensureConsent(auth.user_id);
    if (!consentRes.ok) return json(500, { ok: false, error: "consent_check_failed" });
    if (!consentRes.consent) return json(403, { ok: false, error: "image_consent_required" });

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return json(400, { ok: false, error: "missing_file" });
    }

    const mime = String(file.type || "").toLowerCase();
    if (!isImageMime(mime)) {
      return json(415, { ok: false, error: "unsupported_image_type" });
    }

    // límite tamaño (2MB)
    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return json(413, { ok: false, error: "file_too_large_max_2mb" });
    }

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    // Guardado simple canónico en este sprint: data URL en DB
    const avatar_url = toDataUrl(mime, buf);

    const up = await updateAvatarUrl(auth.user_id, avatar_url);
    if (!up.ok) return json(500, { ok: false, error: up.error || "update_failed" });

    return json(200, { ok: true, avatar_url: up.avatar_url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    // CRÍTICO: nunca HTML, siempre JSON
    return json(500, { ok: false, error: msg });
  }
}

/**
 * DELETE /api/community/avatar
 * Clears avatar_url
 */
export async function DELETE(_req: NextRequest) {
  try {
    const auth = await getAuthedUserId();
    if (!auth.ok || !auth.user_id) return json(401, { ok: false, error: "unauthorized" });

    const res = await clearAvatarUrl(auth.user_id);
    if (!res.ok) return json(500, { ok: false, error: res.error || "delete_failed" });

    return json(200, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return json(500, { ok: false, error: msg });
  }
}
