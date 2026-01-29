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

export async function POST(req: Request) {
  let stage = "init";

  try {
    stage = "auth_token";
    const token = getBearerToken(req);
    if (!token) return json(401, { ok: false, stage, error: "Falta Authorization Bearer token" });

    stage = "env";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon || !service) {
      return json(500, { ok: false, stage, error: "Faltan variables Supabase (URL/ANON/SERVICE_ROLE)" });
    }

    // 1) Validar usuario con el token (ANON)
    stage = "auth_get_user";
    const supaAuth = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supaAuth.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json(401, { ok: false, stage, error: "Sesión inválida" });

    // 2) Service client (bypass RLS)
    stage = "service_client";
    const supabase = createClient(url, service, { auth: { persistSession: false } });

    // 3) Actor + RBAC
    stage = "actor_lookup";
    const { data: actor, error: actorErr } = await supabase
      .from("actors")
      .select("id, role, status, name, email, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (actorErr) return json(500, { ok: false, stage, error: actorErr.message });
    if (!actor?.id) return json(403, { ok: false, stage, error: "Actor no encontrado para este usuario." });

    if (String(actor.status || "").toLowerCase() === "inactive") {
      return json(403, { ok: false, stage, error: "Actor inactivo." });
    }

    const role = String(actor.role || "").toLowerCase();
    const isAdmin = role === "admin" || role === "super_admin" || role === "superadmin";
    if (!isAdmin) return json(403, { ok: false, stage, error: "No autorizado: admin/superadmin." });

    // 4) Delegates list
    stage = "delegates_select";
    const { data: rows, error: dErr } = await supabase
      .from("delegates")
      .select("id, name, email")
      .order("name", { ascending: true });

    if (dErr) return json(500, { ok: false, stage, error: dErr.message });

    return json(200, {
      ok: true,
      actor: { id: String(actor.id), role: String(actor.role ?? ""), name: actor.name ?? actor.email ?? "—" },
      delegates: Array.isArray(rows)
        ? rows.map((d: any) => ({ id: String(d.id), name: d.name ?? null, email: d.email ?? null }))
        : [],
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
