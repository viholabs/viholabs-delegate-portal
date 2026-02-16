// src/app/api/community/profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

async function safeRead(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.id) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const { data, error } = await supabase
    .from("v_community_identity_card_v1")
    .select(
      `
      viholabs_id,
      joined_at,
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
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) return json(500, { ok: false, error: error.message });
  if (!data) return json(404, { ok: false, error: "profile_not_found" });

  // Respuesta compatible con tu UI previa
  return json(200, {
    ok: true,
    profile: {
      // legacy-compatible
      aka: data.aka ?? "",
      display_name: data.display_name ?? "",
      company: data.company ?? "",
      profile_type: data.profile_type ?? "",
      birthday: data.birthday ?? null,
      consent_image_policy: Boolean(data.consent_image_policy),
      avatar_url: data.avatar_url ?? "",
      is_internal: data.department != null || data.job_title != null, // heurística suave

      department: data.department ?? "",
      job_title: data.job_title ?? "",
      effective_name: data.effective_name ?? data.display_name ?? "",

      // NUEVO: canónico
      viholabs_id: data.viholabs_id,
      joined_at: data.joined_at,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.id) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const body = await safeRead(req);

  const nextAka = typeof body?.aka === "string" ? body.aka.trim() : null;
  const nextDisplayName = typeof body?.display_name === "string" ? body.display_name.trim() : null;

  // consent: solo permite pasar a true
  const wantsConsentTrue = body?.consent_image_policy === true;

  // Nada que hacer
  if (nextAka === null && nextDisplayName === null && !wantsConsentTrue) {
    return json(200, { ok: true });
  }

  // 1) Update PROFILES.display_name si viene
  if (nextDisplayName !== null) {
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: nextDisplayName })
      .eq("user_id", user.id);

    if (error) return json(500, { ok: false, error: error.message });
  }

  // 2) Update user_profile_private (aka, consent_image_policy)
  // Nota: si no existe fila, intentamos upsert (canónico: 1 fila por user_id)
  if (nextAka !== null || wantsConsentTrue) {
    const patch: any = {};
    if (nextAka !== null) patch.aka = nextAka;
    if (wantsConsentTrue) patch.consent_image_policy = true;

    const { error } = await supabase
      .from("user_profile_private")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });

    if (error) return json(500, { ok: false, error: error.message });
  }

  // devolver perfil ya actualizado (re-GET)
  return await GET();
}
