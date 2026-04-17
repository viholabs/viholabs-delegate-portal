import { NextRequest, NextResponse } from "next/server";

import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

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

type ActorRoleRow = {
  actor_id: string;
  role_code: string | null;
  is_primary?: boolean | null;
  assigned_at?: string | null;
  state_code: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  holded_contact_id: string | null;
};

type ClientRecommendationRow = {
  id: string;
  recommender_client_id: string | null;
  referred_client_id: string | null;
  percentage: number | null;
  active: boolean | null;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  mode: string | null;
  state_code: string | null;
};

type UpsertBody =
  | {
      clientHoldedContactId: string;
      assignmentRole:
        | "delegate"
        | "kol"
        | "coordinator"
        | "commissionist_1"
        | "commissionist_2"
        | "commissionist_3"
        | "commissionist_4"
        | "commissionist_5";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "recommender";
      recommenderClientId: string | null;
    };

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function isOk(ar: unknown): ar is ActorFromRequestOk {
  if (!ar || typeof ar !== "object") return false;

  const v = ar as {
    ok?: unknown;
    actor?: { id?: unknown } | null;
    supaService?: unknown;
  };

  return v.ok === true && typeof v.actor?.id === "string" && !!v.supaService;
}

function normalizeRole(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v || null;
}

function canManageClientAssignmentsByRole(roles: string[]): boolean {
  return roles.some((role) =>
    [
      "melquisedec",
      "super_admin",
      "delegate",
      "kol",
      "coordinator",
      "coordinator_commercial",
      "coordinator_cect",
      "administrative",
      "administrativa",
    ].includes(role),
  );
}

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

async function requireAuthorized(req: NextRequest) {
  const resolved = (await getActorFromRequest(req)) as
    | ActorFromRequestOk
    | ActorFromRequestFail
    | unknown;

  if (!isOk(resolved)) {
    const fail = resolved as ActorFromRequestFail | undefined;
    return {
      ok: false as const,
      response: json(fail?.status ?? 401, {
        ok: false,
        error: fail?.error ?? "UNAUTHENTICATED",
      }),
    };
  }

  const actorId = String(resolved.actor.id);
  const eff = await getEffectivePermissionsByActorId(actorId);

  const actorRolesResult = await resolved.supaService
    .from("actor_roles")
    .select("actor_id, role_code, state_code")
    .eq("actor_id", actorId)
    .eq("state_code", "OPEN");

  if (actorRolesResult.error) {
    return {
      ok: false as const,
      response: json(500, {
        ok: false,
        error: actorRolesResult.error.message,
      }),
    };
  }

  const rolesSet = new Set<string>();
  const baseRole = normalizeRole(resolved.actor.role);
  if (baseRole) rolesSet.add(baseRole);

  for (const row of (actorRolesResult.data ?? []) as ActorRoleRow[]) {
    const role = normalizeRole(row.role_code);
    if (role) rolesSet.add(role);
  }

  const roles = Array.from(rolesSet);

  const allowed =
    eff.isSuperAdmin ||
    eff.has("clients.manage") ||
    canManageClientAssignmentsByRole(roles);

  if (!allowed) {
    return {
      ok: false as const,
      response: json(403, {
        ok: false,
        error: "FORBIDDEN",
      }),
    };
  }

  return {
    ok: true as const,
    resolved,
    actorId,
    roles,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthorized(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as UpsertBody | null;

    const clientHoldedContactId = String(body?.clientHoldedContactId ?? "").trim();
    const assignmentRole = String(body?.assignmentRole ?? "").trim();

    if (!clientHoldedContactId) {
      return json(422, { ok: false, error: "clientHoldedContactId requerido" });
    }

    const supa = auth.resolved.supaService;

    // ===== VALIDACIÓN CRÍTICA PARA DELEGATE =====
    if (assignmentRole === "delegate") {
      const targetActorId = String(
        (body as any)?.actorId ?? ""
      ).trim();

      if (targetActorId) {
        const roleCheck = await supa
          .from("actor_roles")
          .select("actor_id")
          .eq("actor_id", targetActorId)
          .eq("role_code", "delegate")
          .eq("state_code", "OPEN")
          .limit(1);

        if (roleCheck.error) {
          return json(500, {
            ok: false,
            error: roleCheck.error.message,
          });
        }

        if (!roleCheck.data || roleCheck.data.length === 0) {
          return json(422, {
            ok: false,
            error:
              "El actor seleccionado NO tiene rol activo de delegado (OPEN)",
          });
        }
      }
    }
    // ===== FIN VALIDACIÓN =====

    // ===== RESTO DE LÓGICA ORIGINAL SIN TOCAR =====

    const targetActorId = String(
      (body as any)?.actorId ?? ""
    ).trim();

    const currentOpenResult = await supa
      .from("client_actor_assignments_g1")
      .select("actor_id")
      .eq("client_holded_contact_id", clientHoldedContactId)
      .eq("assignment_role", assignmentRole)
      .is("valid_to", null);

    if (currentOpenResult.error) {
      return json(500, {
        ok: false,
        error: currentOpenResult.error.message,
      });
    }

    if ((currentOpenResult.data ?? []).length > 0) {
      await supa
        .from("client_actor_assignments_g1")
        .update({ valid_to: todayIsoDate() })
        .eq("client_holded_contact_id", clientHoldedContactId)
        .eq("assignment_role", assignmentRole)
        .is("valid_to", null);
    }

    if (!targetActorId) {
      return json(200, { ok: true, changed: true, mode: "clear" });
    }

    const insertResult = await supa.from("client_actor_assignments_g1").insert({
      actor_id: targetActorId,
      client_holded_contact_id: clientHoldedContactId,
      assignment_role: assignmentRole,
      valid_from: todayIsoDate(),
      valid_to: null,
      source: `el-elyon:${auth.actorId}`,
    });

    if (insertResult.error) {
      return json(500, {
        ok: false,
        error: insertResult.error.message,
      });
    }

    return json(200, {
      ok: true,
      changed: true,
      assignmentRole,
      mode: "set",
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
  }
}