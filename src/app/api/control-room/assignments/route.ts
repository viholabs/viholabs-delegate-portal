// src/app/api/control-room/assignments/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type ActorLite = {
  id: string;
  role: string | null;
  status?: string | null;
  name?: string | null;
  email?: string | null;
};

type ActorFromRequestOk = {
  ok: true;
  actor: ActorLite;
  supaRls: any;
  supaService?: any;
};

type ActorFromRequestFail = {
  ok: false;
  status: number;
  error: string;
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor && !!ar.supaRls;
}

function hasAnyPermission(
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean },
  codes: string[]
) {
  if (eff.isSuperAdmin) return true;
  return codes.some((c) => eff.has(c));
}

function getServiceClientOrThrow() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

type EntityType = "delegate" | "distributor" | "client";
type AssignmentKind = "commercial" | "technical";

function isEntityType(v: any): v is EntityType {
  return v === "delegate" || v === "distributor" || v === "client";
}
function isAssignmentKind(v: any): v is AssignmentKind {
  return v === "commercial" || v === "technical";
}

type PostPayload = {
  entity_type: EntityType;
  entity_id: string;
  assignment_kind: AssignmentKind;
  coordinator_actor_id: string;
  active?: boolean;
};

async function handleGET(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor + supaRls (canónico)
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as ActorFromRequestOk | ActorFromRequestFail | any;

    if (!isOk(ar)) {
      return json((ar?.status as number) ?? 401, {
        ok: false,
        stage,
        error: (ar?.error as string) ?? "No autenticado",
      });
    }

    const actor = ar.actor;
    const supaRls = ar.supaRls;

    // 2) Permisos efectivos
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed = hasAnyPermission(eff, [
      // permisos canónicos de la Biblia
      "assignments.read",
      "assignments.manage",
      // aliases “control_room.*” por compatibilidad
      "control_room.assignments.read",
      "control_room.assignments.manage",
      // fallback temporal (como delegates)
      "actors.read",
      "control_room.read",
    ]);

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (assignments.read)",
      });
    }

    // 3) Filtros opcionales (querystring)
    stage = "filters";
    const u = new URL(req.url);
    const entity_type = (u.searchParams.get("entity_type") || "").trim();
    const entity_id = (u.searchParams.get("entity_id") || "").trim();
    const coordinator_actor_id = (u.searchParams.get("coordinator_actor_id") || "").trim();
    const assignment_kind = (u.searchParams.get("assignment_kind") || "").trim();
    const activeStr = (u.searchParams.get("active") || "").trim(); // "true"/"false"

    // 4) Lectura con RLS (la BD decide el scope)
    stage = "assignments_select";
    let q = supaRls
      .from("assignments")
      .select(
        "id, coordinator_actor_id, entity_type, entity_id, assignment_kind, active, created_at, updated_at"
      )
      .order("updated_at", { ascending: false });

    if (entity_type) q = q.eq("entity_type", entity_type);
    if (entity_id) q = q.eq("entity_id", entity_id);
    if (coordinator_actor_id) q = q.eq("coordinator_actor_id", coordinator_actor_id);
    if (assignment_kind) q = q.eq("assignment_kind", assignment_kind);
    if (activeStr === "true") q = q.eq("active", true);
    if (activeStr === "false") q = q.eq("active", false);

    const { data: rows, error } = await q.limit(2000);

    if (error) {
      return json(500, { ok: false, stage, error: error.message });
    }

    return json(200, {
      ok: true,
      actor: {
        id: String(actor.id),
        role: actor.role ?? null,
        name: actor.name ?? actor.email ?? null,
      },
      assignments: Array.isArray(rows) ? rows : [],
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}

async function handlePOST(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor + supaRls
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as ActorFromRequestOk | ActorFromRequestFail | any;

    if (!isOk(ar)) {
      return json((ar?.status as number) ?? 401, {
        ok: false,
        stage,
        error: (ar?.error as string) ?? "No autenticado",
      });
    }

    const actor = ar.actor;

    // 2) Permisos efectivos
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed = hasAnyPermission(eff, [
      "assignments.manage",
      "control_room.assignments.manage",
      // fallback temporal (por si aún no está el permiso cableado en algún rol)
      "actors.manage",
    ]);

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (assignments.manage)",
      });
    }

    // 3) Input
    stage = "input";
    const body = (await req.json().catch(() => null)) as Partial<PostPayload> | null;

    const entity_type = body?.entity_type as any;
    const entity_id = String(body?.entity_id ?? "").trim();
    const assignment_kind = body?.assignment_kind as any;
    const coordinator_actor_id = String(body?.coordinator_actor_id ?? "").trim();
    const active = typeof body?.active === "boolean" ? body.active : true;

    if (!isEntityType(entity_type)) {
      return json(422, { ok: false, stage, error: "entity_type inválido (delegate|distributor|client)" });
    }
    if (!entity_id) {
      return json(422, { ok: false, stage, error: "entity_id requerido" });
    }
    if (!isAssignmentKind(assignment_kind)) {
      return json(422, { ok: false, stage, error: "assignment_kind inválido (commercial|technical)" });
    }
    if (!coordinator_actor_id) {
      return json(422, { ok: false, stage, error: "coordinator_actor_id requerido" });
    }

    // 4) Escritura interna robusta con SERVICE ROLE (idempotente)
    stage = "service_client";
    const supaService = getServiceClientOrThrow();

    // 4.1) Buscar existente por (entity_type, entity_id, assignment_kind)
    stage = "assignments.select_existing";
    const { data: existing, error: eSel } = await supaService
      .from("assignments")
      .select("id, coordinator_actor_id, active")
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id)
      .eq("assignment_kind", assignment_kind)
      .maybeSingle();

    if (eSel) return json(500, { ok: false, stage, error: eSel.message });

    // 4.2) Update o Insert
    if (existing?.id) {
      stage = "assignments.update";
      const { error: eUp } = await supaService
        .from("assignments")
        .update({
          coordinator_actor_id,
          active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (eUp) return json(500, { ok: false, stage, error: eUp.message });

      return json(200, {
        ok: true,
        action: "updated",
        id: existing.id,
      });
    }

    stage = "assignments.insert";
    const { data: ins, error: eIns } = await supaService
      .from("assignments")
      .insert({
        coordinator_actor_id,
        entity_type,
        entity_id,
        assignment_kind,
        active,
      })
      .select("id")
      .maybeSingle();

    if (eIns) return json(500, { ok: false, stage, error: eIns.message });

    return json(200, {
      ok: true,
      action: "inserted",
      id: ins?.id ?? null,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}

export async function GET(req: Request) {
  return handleGET(req);
}

export async function POST(req: Request) {
  return handlePOST(req);
}
