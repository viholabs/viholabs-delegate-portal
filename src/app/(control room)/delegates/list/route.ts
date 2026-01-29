import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    stage = "auth_token";
    const token = getBearerToken(req);
    if (!token) return json(401, { ok: false, stage, error: "Falta Authorization Bearer token" });

    stage = "supabase_admin";
    const supabase = createAdminClient();

    stage = "auth_get_user";
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user?.id) {
      return json(401, { ok: false, stage, error: "Sesión inválida" });
    }

    const userId = userRes.user.id;

    stage = "actor_lookup";
    const { data: actor, error: actorErr } = await supabase
      .from("actors")
      .select("id, role, name, email, status")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (actorErr) return json(500, { ok: false, stage, error: actorErr.message });
    if (!actor?.id) return json(403, { ok: false, stage, error: "Actor no encontrado" });
    if (String(actor.status || "").toLowerCase() === "inactive") {
      return json(403, { ok: false, stage, error: "Actor inactivo" });
    }

    const role = String(actor.role ?? "").toLowerCase();
    const isAdmin = role === "admin" || role === "super_admin" || role === "superadmin";
    if (!isAdmin) return json(403, { ok: false, stage, error: "No autorizado" });

    stage = "delegates_select";
    const { data: rows, error: dErr } = await supabase
      .from("delegates")
      .select("id, name, email")
      .order("name", { ascending: true });

    if (dErr) return json(500, { ok: false, stage, error: dErr.message });

    return json(200, {
      ok: true,
      actor: { id: actor.id, role: actor.role, name: actor.name ?? null },
      delegates: Array.isArray(rows) ? rows : [],
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
