// src/app/(control room)/delegates/list/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor + cliente RLS
    stage = "actor_from_request";
    const ar = await getActorFromRequest(req);
    if (!ar.ok) return json(ar.status, { ok: false, stage, error: ar.error });

    const { actor, supaRls } = ar;

    // 2) Autorización (temporal por rol, hasta que tengamos requirePermission global)
    stage = "authorize";
    const role = String(actor.role ?? "").toUpperCase();
    const allowed =
      role === "SUPER_ADMIN" ||
      role === "ADMINISTRATIVE" ||
      role === "COORDINATOR_COMMERCIAL" ||
      role === "COORDINATOR_CECT";

    if (!allowed) return json(403, { ok: false, stage, error: "No autorizado" });

    // 3) Lectura con RLS (la BD decide qué delegates puede ver este actor)
    stage = "delegates_select";
    const { data: rows, error: dErr } = await supaRls
      .from("delegates")
      .select("id, name, email")
      .order("name", { ascending: true });

    if (dErr) return json(500, { ok: false, stage, error: dErr.message });

    return json(200, {
      ok: true,
      actor: { id: actor.id, role: actor.role, name: (actor as any).name ?? null },
      delegates: Array.isArray(rows) ? rows : [],
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
