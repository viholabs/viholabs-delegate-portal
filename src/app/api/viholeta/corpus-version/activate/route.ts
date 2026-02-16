// src/app/api/viholeta/corpus-version/activate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normalizeRole(role: any) {
  return String(role ?? "").trim().toUpperCase();
}

function requireSuperAdmin(roleRaw: any) {
  const role = normalizeRole(roleRaw);
  return role === "SUPER_ADMIN" || role === "SUPERADMIN";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Actor desde cookies/session (contexto del Portal)
    const actorRes = await getActorFromRequest(req);
    if (!actorRes?.ok) {
      return json(401, { ok: false, error: "unauthorized", detail: actorRes?.error ?? "no_actor" });
    }

    const actor = actorRes.actor;
    if (!requireSuperAdmin(actor?.role)) {
      return json(403, { ok: false, error: "forbidden", detail: "SUPER_ADMIN required" });
    }

    let payload: any = null;
    try {
      payload = await req.json();
    } catch {
      payload = null;
    }

    const code = String(payload?.code ?? "").trim();
    if (!code) {
      return json(400, { ok: false, error: "bad_request", detail: "Missing 'code'" });
    }

    // Ejecuta setter canónico (bloquea si no SUPER_ADMIN)
    const { error } = await supabase.rpc("viholeta_corpus_version_set_active", { p_code: code });
    if (error) {
      return json(500, { ok: false, error: "server_error", detail: error.message });
    }

    // Confirmación: devolver versión activa actual
    const { data: active, error: e2 } = await supabase.rpc("viholeta_corpus_version_current");
    if (e2) {
      return json(200, { ok: true, activated: code, active_version: null, warning: e2.message });
    }

    return json(200, { ok: true, activated: code, active_version: active ?? null });
  } catch (err: any) {
    return json(500, { ok: false, error: "server_error", detail: err?.message ?? "unknown" });
  }
}
