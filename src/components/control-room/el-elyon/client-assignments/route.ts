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

type ClientAssignmentRow = {
  actor_id: string;
  client_holded_contact_id: string;
  assignment_role: string;
  valid_from: string | null;
  valid_to: string | null;
  source: string | null;
};

type ActorCatalogRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
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

function hasPrivilegedRole(roles: string[]): boolean {
  return roles.some((role) =>
    [
      "melquisedec",
      "super_admin",
      "coordinator",
      "coordinator_commercial",
      "coordinator_cect",
      "administrative",
      "administrativa",
    ].includes(role),
  );
}

export async function GET(req: NextRequest) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const resolved = (await getActorFromRequest(req)) as
      | ActorFromRequestOk
      | ActorFromRequestFail
      | unknown;

    if (!isOk(resolved)) {
      const fail = resolved as ActorFromRequestFail | undefined;
      return json(fail?.status ?? 401, {
        ok: false,
        error: fail?.error ?? "UNAUTHENTICATED",
      });
    }

    const actorId = String(resolved.actor.id);

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(actorId);

    stage = "actor_roles";
    const actorRolesResult = await resolved.supaService
      .from("actor_roles")
      .select("actor_id, role_code, is_primary, assigned_at, state_code")
      .eq("actor_id", actorId)
      .eq("state_code", "OPEN");

    if (actorRolesResult.error) {
      return json(500, {
        ok: false,
        error: actorRolesResult.error.message,
      });
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
      eff.has("actors.read") ||
      eff.has("clients.read") ||
      eff.has("clients.manage") ||
      eff.has("control_room.delegates.read") ||
      eff.has("invoices.read") ||
      eff.has("invoices.manage") ||
      hasPrivilegedRole(roles);

    if (!allowed) {
      return json(403, {
        ok: false,
        error: "FORBIDDEN",
      });
    }

    stage = "load_parallel";
    const [clientsResult, assignmentsResult, actorsResult, allActorRolesResult] =
      await Promise.all([
        resolved.supaService
          .from("clients")
          .select("id, name, holded_contact_id")
          .not("holded_contact_id", "is", null)
          .order("name", { ascending: true }),

        resolved.supaService
          .from("client_actor_assignments_g1")
          .select(
            "actor_id, client_holded_contact_id, assignment_role, valid_from, valid_to, source",
          )
          .in("assignment_role", ["delegate", "recommender"])
          .is("valid_to", null),

        resolved.supaService
          .from("actors")
          .select("id, name, email, role, status")
          .order("name", { ascending: true }),

        resolved.supaService
          .from("actor_roles")
          .select("actor_id, role_code, is_primary, assigned_at, state_code")
          .eq("state_code", "OPEN"),
      ]);

    if (clientsResult.error) {
      return json(500, { ok: false, error: clientsResult.error.message });
    }

    if (assignmentsResult.error) {
      return json(500, { ok: false, error: assignmentsResult.error.message });
    }

    if (actorsResult.error) {
      return json(500, { ok: false, error: actorsResult.error.message });
    }

    if (allActorRolesResult.error) {
      return json(500, { ok: false, error: allActorRolesResult.error.message });
    }

    const actorRows = (actorsResult.data ?? []) as ActorCatalogRow[];
    const actorRoleRows = (allActorRolesResult.data ?? []) as ActorRoleRow[];
    const roleMap = new Map<string, Set<string>>();

    for (const actorRow of actorRows) {
      const set = new Set<string>();
      const baseRoleValue = normalizeRole(actorRow.role);
      if (baseRoleValue) set.add(baseRoleValue);
      roleMap.set(actorRow.id, set);
    }

    for (const actorRoleRow of actorRoleRows) {
      const roleValue = normalizeRole(actorRoleRow.role_code);
      if (!roleValue) continue;
      if (!roleMap.has(actorRoleRow.actor_id)) {
        roleMap.set(actorRoleRow.actor_id, new Set<string>());
      }
      roleMap.get(actorRoleRow.actor_id)!.add(roleValue);
    }

    const eligibleActors = actorRows.map((actorRow) => ({
      id: actorRow.id,
      name: actorRow.name,
      email: actorRow.email,
      status: actorRow.status,
      roles: Array.from(roleMap.get(actorRow.id) ?? []),
    }));

    const delegates = eligibleActors.filter((row) => row.roles.includes("delegate"));
    const recommenders = eligibleActors.filter((row) => row.roles.includes("recommender"));
    const kols = eligibleActors.filter((row) => row.roles.includes("kol"));
    const coordinators = eligibleActors.filter((row) =>
      row.roles.some((role) =>
        ["coordinator", "coordinator_commercial", "coordinator_cect"].includes(role),
      ),
    );

    const activeAssignments = (assignmentsResult.data ?? []) as ClientAssignmentRow[];

    const delegateByHoldedContactId = new Map<string, ClientAssignmentRow>();
    const recommenderByHoldedContactId = new Map<string, ClientAssignmentRow>();

    for (const row of activeAssignments) {
      if (row.assignment_role === "delegate") {
        delegateByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "recommender") {
        recommenderByHoldedContactId.set(row.client_holded_contact_id, row);
      }
    }

    const actorById = new Map(eligibleActors.map((row) => [row.id, row]));

    const clients = ((clientsResult.data ?? []) as ClientRow[]).map((client) => {
      const holdedContactId = client.holded_contact_id ?? "";
      const delegateAssignment = delegateByHoldedContactId.get(holdedContactId) ?? null;
      const recommenderAssignment = recommenderByHoldedContactId.get(holdedContactId) ?? null;

      const delegateActor = delegateAssignment
        ? actorById.get(delegateAssignment.actor_id) ?? null
        : null;

      const recommenderActor = recommenderAssignment
        ? actorById.get(recommenderAssignment.actor_id) ?? null
        : null;

      return {
        id: client.id,
        name: client.name,
        holdedContactId,
        delegate: delegateAssignment
          ? {
              actorId: delegateAssignment.actor_id,
              actorName: delegateActor?.name ?? null,
              source: delegateAssignment.source,
              validFrom: delegateAssignment.valid_from,
            }
          : null,
        recommender: recommenderAssignment
          ? {
              actorId: recommenderAssignment.actor_id,
              actorName: recommenderActor?.name ?? null,
              source: recommenderAssignment.source,
              validFrom: recommenderAssignment.valid_from,
            }
          : null,
      };
    });

    return json(200, {
      ok: true,
      viewer: {
        actorId: resolved.actor.id,
        actorName: resolved.actor.name ?? null,
        roles,
      },
      dictionaries: {
        delegates,
        recommenders,
        kols,
        coordinators,
      },
      clients,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
  }
}