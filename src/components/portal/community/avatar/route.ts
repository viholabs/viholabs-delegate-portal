// src/app/api/community/avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

// TODO_CANON: ajusta si tu bucket se llama distinto
const AVATAR_BUCKET = process.env.VIHO_AVATAR_BUCKET || "avatars";

// TODO_CANON: ajusta la tabla/columna donde realmente sale avatar_url en /api/community/profile
// Opción A (más probable): tabla "actors" columna "avatar_url"
// Opción B: tabla "community_profiles" columna "avatar_url"
const AVATAR_TABLE = process.env.VIHO_AVATAR_TABLE || "actors";
const AVATAR_COLUMN = process.env.VIHO_AVATAR_COLUMN || "avatar_url";

function getEnvOrThrow() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("Missing SUPABASE env vars (URL/SERVICE_ROLE)");
  return { url, service };
}

function safeFileExt(name: string) {
  const n = String(name || "").toLowerCase();
  const m = n.match(/\.([a-z0-9]{2,5})$/);
  const ext = m?.[1] || "jpg";
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return "jpg";
  return ext === "jpeg" ? "jpg" : ext;
}

export async function POST(req: NextRequest) {
  // Auth actor (cookies o bearer)
  const ar = await getActorFromRequest(req);
  if (!ar?.ok) return json(ar?.status ?? 401, { ok: false, error: ar?.error ?? "unauthorized" });

  const actorId = String(ar.actor?.id || "");
  if (!actorId) return json(400, { ok: false, error: "actor_missing" });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, error: "invalid_form_data" });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json(400, { ok: false, error: "file_required" });
  }

  const { url, service } = getEnvOrThrow();
  const supa = createAdminClient(url, service, { auth: { persistSession: false } });

  const ext = safeFileExt(file.name);
  const path = `community/${actorId}/${Date.now()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());

  // 1) upload storage
  const up = await supa.storage.from(AVATAR_BUCKET).upload(path, buf, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (up.error) {
    return json(500, { ok: false, error: "storage_upload_failed", message: up.error.message });
  }

  // 2) public url (si tu bucket es privado, cambia a signed URL)
  const pub = supa.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = String(pub.data?.publicUrl || "");
  if (!publicUrl) {
    return json(500, { ok: false, error: "public_url_failed" });
  }

  // 3) persistir avatar_url en DB (en el mismo sitio de donde lo lee /api/community/profile)
  const { error: uErr } = await supa
    .from(AVATAR_TABLE)
    .update({ [AVATAR_COLUMN]: publicUrl } as any)
    .eq("id", actorId);

  if (uErr) {
    return json(500, { ok: false, error: "db_update_failed", message: uErr.message, avatar_url: publicUrl });
  }

  return json(200, { ok: true, avatar_url: publicUrl });
}

export async function DELETE(req: NextRequest) {
  const ar = await getActorFromRequest(req);
  if (!ar?.ok) return json(ar?.status ?? 401, { ok: false, error: ar?.error ?? "unauthorized" });

  const actorId = String(ar.actor?.id || "");
  if (!actorId) return json(400, { ok: false, error: "actor_missing" });

  const { url, service } = getEnvOrThrow();
  const supa = createAdminClient(url, service, { auth: { persistSession: false } });

  const { error: uErr } = await supa
    .from(AVATAR_TABLE)
    .update({ [AVATAR_COLUMN]: "" } as any)
    .eq("id", actorId);

  if (uErr) {
    return json(500, { ok: false, error: "db_update_failed", message: uErr.message });
  }

  return json(200, { ok: true });
}
