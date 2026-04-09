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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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
    .select("actor_id, role_code, is_primary, assigned_at, state_code")
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

export async function GET(req: NextRequest) {
  const mod = await import("../route");
  return mod.GET(req);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthorized(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as UpsertBody | null;
    const clientHoldedContactId = String(body?.clientHoldedContactId ?? "").trim();
    const assignmentRole = String(body?.assignmentRole ?? "").trim();

    if (!clientHoldedContactId) {
      return json(422, {
        ok: false,
        error: "clientHoldedContactId requerido",
      });
    }

    if (
      ![
        "delegate",
        "recommender",
        "kol",
        "coordinator",
        "commissionist_1",
        "commissionist_2",
        "commissionist_3",
        "commissionist_4",
        "commissionist_5",
      ].includes(assignmentRole)
    ) {
      return json(422, {
        ok: false,
        error: "assignmentRole no soportado",
      });
    }

    const supa = auth.resolved.supaService;
    const actorId = auth.actorId;

    const clientResult = await supa
      .from("clients")
      .select("id, name, holded_contact_id")
      .eq("holded_contact_id", clientHoldedContactId)
      .maybeSingle();

    if (clientResult.error) {
      return json(500, {
        ok: false,
        error: clientResult.error.message,
      });
    }

    const clientData = (clientResult.data ?? null) as ClientRow | null;

    if (!clientData?.id) {
      return json(404, {
        ok: false,
        error: "Cliente no encontrado para ese holded_contact_id",
      });
    }

    if (assignmentRole === "recommender") {
      const recommenderClientId = String(
        (body as Extract<UpsertBody, { assignmentRole: "recommender" }> | null)
          ?.recommenderClientId ?? "",
      ).trim();

      if (recommenderClientId && recommenderClientId === clientData.id) {
        return json(422, {
          ok: false,
          error: "El recomendador no puede ser el mismo cliente",
        });
      }

      if (recommenderClientId && !isUuid(recommenderClientId)) {
        return json(422, {
          ok: false,
          error: "recommenderClientId inválido",
        });
      }

      const currentOpenResult = await supa
        .from("client_recommendations")
        .select(
          "id, recommender_client_id, referred_client_id, percentage, active, valid_from, valid_to, notes, created_at, updated_at, mode, state_code",
        )
        .eq("referred_client_id", clientData.id)
        .eq("active", true)
        .is("valid_to", null)
        .eq("state_code", "OPEN");

      if (currentOpenResult.error) {
        return json(500, {
          ok: false,
          error: currentOpenResult.error.message,
        });
      }

      const currentRows = (currentOpenResult.data ?? []) as ClientRecommendationRow[];
      const currentOpenSamePair =
        recommenderClientId
          ? currentRows.find(
              (row) => String(row.recommender_client_id ?? "").trim() === recommenderClientId,
            ) ?? null
          : null;

      if (currentOpenSamePair) {
        return json(200, {
          ok: true,
          changed: false,
          assignmentRole,
          mode: "noop",
        });
      }

      if (currentRows.length > 0) {
        const closeResult = await supa
          .from("client_recommendations")
          .update({
            active: false,
            valid_to: todayIsoDate(),
            updated_at: nowIso(),
            state_code: "INACTIVE",
          })
          .eq("referred_client_id", clientData.id)
          .eq("active", true)
          .is("valid_to", null)
          .eq("state_code", "OPEN");

        if (closeResult.error) {
          return json(500, {
            ok: false,
            error: closeResult.error.message,
          });
        }
      }

      if (!recommenderClientId) {
        return json(200, {
          ok: true,
          changed: true,
          assignmentRole,
          mode: "clear",
        });
      }

      const recommenderClientResult = await supa
        .from("clients")
        .select("id, name, holded_contact_id")
        .eq("id", recommenderClientId)
        .maybeSingle();

      if (recommenderClientResult.error) {
        return json(500, {
          ok: false,
          error: recommenderClientResult.error.message,
        });
      }

      const recommenderClientData = (recommenderClientResult.data ?? null) as ClientRow | null;

      if (!recommenderClientData?.id) {
        return json(404, {
          ok: false,
          error: "Cliente recomendador no encontrado",
        });
      }

      const historicalPairResult = await supa
        .from("client_recommendations")
        .select(
          "id, recommender_client_id, referred_client_id, percentage, active, valid_from, valid_to, notes, created_at, updated_at, mode, state_code",
        )
        .eq("recommender_client_id", recommenderClientId)
        .eq("referred_client_id", clientData.id)
        .limit(1)
        .maybeSingle();

      if (historicalPairResult.error) {
        return json(500, {
          ok: false,
          error: historicalPairResult.error.message,
        });
      }

      const historicalPair = (historicalPairResult.data ?? null) as ClientRecommendationRow | null;

      if (historicalPair?.id) {
        const reopenResult = await supa
          .from("client_recommendations")
          .update({
            percentage: 7,
            active: true,
            valid_from: todayIsoDate(),
            valid_to: null,
            notes: "EL-ELYON manual upsert",
            mode: "deduct",
            updated_at: nowIso(),
            state_code: "OPEN",
          })
          .eq("id", historicalPair.id);

        if (reopenResult.error) {
          return json(500, {
            ok: false,
            error: reopenResult.error.message,
          });
        }

        return json(200, {
          ok: true,
          changed: true,
          assignmentRole,
          mode: "reopen",
        });
      }

      const insertResult = await supa.from("client_recommendations").insert({
        recommender_client_id: recommenderClientId,
        referred_client_id: clientData.id,
        percentage: 7,
        active: true,
        valid_from: todayIsoDate(),
        valid_to: null,
        notes: "EL-ELYON manual upsert",
        mode: "deduct",
        state_code: "OPEN",
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
    }

    const actorAssignmentBody = body as Exclude<
      UpsertBody,
      { assignmentRole: "recommender" }
    >;

    const targetActorId = String(actorAssignmentBody?.actorId ?? "").trim();

    const currentOpenResult = await supa
      .from("client_actor_assignments_g1")
      .select(
        "actor_id, client_holded_contact_id, assignment_role, valid_from, valid_to, source",
      )
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
      const closeResult = await supa
        .from("client_actor_assignments_g1")
        .update({
          valid_to: todayIsoDate(),
        })
        .eq("client_holded_contact_id", clientHoldedContactId)
        .eq("assignment_role", assignmentRole)
        .is("valid_to", null);

      if (closeResult.error) {
        return json(500, {
          ok: false,
          error: closeResult.error.message,
        });
      }
    }

    if (!targetActorId) {
      return json(200, {
        ok: true,
        changed: true,
        assignmentRole,
        mode: "clear",
      });
    }

    if (!isUuid(targetActorId)) {
      return json(422, {
        ok: false,
        error: "actorId inválido",
      });
    }

    const actorResult = await supa
      .from("actors")
      .select("id, name, email, role, status")
      .eq("id", targetActorId)
      .maybeSingle();

    if (actorResult.error) {
      return json(500, {
        ok: false,
        error: actorResult.error.message,
      });
    }

    const actorData = actorResult.data ?? null;

    if (!(actorData as { id?: string } | null)?.id) {
      return json(404, {
        ok: false,
        error: "Actor no encontrado",
      });
    }

    const insertResult = await supa.from("client_actor_assignments_g1").insert({
      actor_id: targetActorId,
      client_holded_contact_id: clientHoldedContactId,
      assignment_role: assignmentRole,
      valid_from: todayIsoDate(),
      valid_to: null,
      source: `el-elyon:${actorId}`,
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