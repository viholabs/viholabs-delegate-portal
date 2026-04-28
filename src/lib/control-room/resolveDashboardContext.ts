// src/lib/control-room/resolveDashboardContext.ts

import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

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
  authUserId?: string | null;
  authMode?: "cookies" | "bearer" | "internal_bearer";
};

type ActorFromRequestFail = {
  ok: false;
  status: number;
  error: string;
  stage?: string;
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
  contact_email?: string | null;
};

type ClientActorAssignmentRow = {
  actor_id: string;
  client_holded_contact_id: string;
  assignment_role: string;
  valid_from: string | null;
  valid_to: string | null;
  source: string | null;
};

type AssignmentRow = {
  id: string;
  coordinator_actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  assignment_kind: string | null;
  active: boolean | null;
};

type DelegateRow = {
  id: string;
  actor_id: string | null;
  active?: boolean | null;
};

type PermissionSnapshot = {
  isSuperAdmin: boolean;
  has: (perm: string) => boolean;
};

export type DashboardScopeMode =
  | "self"
  | "assigned"
  | "team"
  | "global"
  | "view_as";

export type DashboardPermissionFlags = {
  isSuperAdmin: boolean;
  canViewGlobal: boolean;
  canViewFinance: boolean;
  canViewActorPerformance: boolean;
  canViewAssignments: boolean;
  canViewCommissions: boolean;
  canViewAudit: boolean;
  canViewIntegrations: boolean;
};

export type DashboardActorIdentity = {
  id: string;
  role: string | null;
  name: string | null;
  email: string | null;
  status: string | null;
  authMode: "cookies" | "bearer" | "internal_bearer" | "unknown";
};

export type DashboardScope = {
  mode: DashboardScopeMode;
  label: string;
  viewAs: {
    active: boolean;
    requestedActorId: string | null;
    effectiveActorId: string | null;
  };
  clientIds: string[];
  clientHoldedContactIds: string[];
  actorIds: string[];
  delegateIds: string[];
};

export type DashboardContext = {
  ok: true;
  actor: DashboardActorIdentity;
  effectiveActor: DashboardActorIdentity;
  roles: string[];
  permissions: DashboardPermissionFlags;
  scope: DashboardScope;
  supaRls: any;
  supaService: any;
};

export type DashboardContextError = {
  ok: false;
  status: number;
  error: string;
  stage?: string;
};

function isOkActorFromRequest(v: any): v is ActorFromRequestOk {
  return !!v && v.ok === true && !!v.actor && !!v.supaRls;
}

function normalizeRole(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v || null;
}

function uniq(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v ?? "").trim())
        .filter((v) => v.length > 0),
    ),
  );
}

function hasRole(roles: string[], expected: string[]) {
  return roles.some((role) => expected.includes(role));
}

function buildPermissionFlags(eff: PermissionSnapshot): DashboardPermissionFlags {
  return {
    isSuperAdmin: eff.isSuperAdmin,

    canViewGlobal:
      eff.isSuperAdmin ||
      eff.has("control_room.read") ||
      eff.has("control_room.dashboard.read") ||
      eff.has("actors.read"),

    canViewFinance:
      eff.isSuperAdmin ||
      eff.has("control_room.invoices.read") ||
      eff.has("invoices.read") ||
      eff.has("objectives.read"),

    canViewActorPerformance:
      eff.isSuperAdmin ||
      eff.has("actors.read") ||
      eff.has("control_room.delegates.read"),

    canViewAssignments:
      eff.isSuperAdmin ||
      eff.has("assignments.read") ||
      eff.has("assignments.manage") ||
      eff.has("control_room.assignments.read") ||
      eff.has("control_room.assignments.manage"),

    canViewCommissions:
      eff.isSuperAdmin ||
      eff.has("commissions.read") ||
      eff.has("control_room.month.read") ||
      eff.has("objectives.read"),

    canViewAudit:
      eff.isSuperAdmin ||
      eff.has("audit.read") ||
      eff.has("control_room.read") ||
      eff.has("actors.read"),

    canViewIntegrations:
      eff.isSuperAdmin ||
      eff.has("control_room.read") ||
      eff.has("actors.read"),
  };
}

function scopeLabel(mode: DashboardScopeMode) {
  if (mode === "global") return "Global";
  if (mode === "team") return "Team";
  if (mode === "assigned") return "Assigned";
  if (mode === "view_as") return "View As";
  return "Self";
}

async function loadOpenRoles(
  supaService: any,
  actorId: string,
  baseRole: string | null,
): Promise<string[]> {
  const rolesSet = new Set<string>();

  const normalizedBaseRole = normalizeRole(baseRole);
  if (normalizedBaseRole) rolesSet.add(normalizedBaseRole);

  const actorRolesResult = await supaService
    .from("actor_roles")
    .select("actor_id, role_code, is_primary, assigned_at, state_code")
    .eq("actor_id", actorId)
    .eq("state_code", "OPEN");

  if (actorRolesResult.error) {
    throw new Error(`actor_roles: ${actorRolesResult.error.message}`);
  }

  for (const row of (actorRolesResult.data ?? []) as ActorRoleRow[]) {
    const role = normalizeRole(row.role_code);
    if (role) rolesSet.add(role);
  }

  return Array.from(rolesSet);
}

async function loadDelegateIdsForActor(
  supaService: any,
  actorId: string,
): Promise<string[]> {
  const result = await supaService
    .from("delegates")
    .select("id, actor_id, active")
    .eq("actor_id", actorId);

  if (result.error) {
    return [];
  }

  return uniq(((result.data ?? []) as DelegateRow[]).map((row) => row.id));
}

async function loadClientAssignmentsForActor(
  supaService: any,
  actorId: string,
) {
  const result = await supaService
    .from("client_actor_assignments_g1")
    .select(
      "actor_id, client_holded_contact_id, assignment_role, valid_from, valid_to, source",
    )
    .eq("actor_id", actorId)
    .is("valid_to", null);

  if (result.error) {
    return [] as ClientActorAssignmentRow[];
  }

  return (result.data ?? []) as ClientActorAssignmentRow[];
}

async function loadCoordinatorAssignmentsForActor(
  supaService: any,
  actorId: string,
) {
  const result = await supaService
    .from("assignments")
    .select(
      "id, coordinator_actor_id, entity_type, entity_id, assignment_kind, active",
    )
    .eq("coordinator_actor_id", actorId)
    .eq("entity_type", "client")
    .eq("active", true);

  if (result.error) {
    return [] as AssignmentRow[];
  }

  return (result.data ?? []) as AssignmentRow[];
}

async function loadClientsByHoldedContactIds(
  supaService: any,
  holdedContactIds: string[],
) {
  if (holdedContactIds.length === 0) return [] as ClientRow[];

  const result = await supaService
    .from("clients")
    .select("id, name, holded_contact_id, contact_email")
    .in("holded_contact_id", holdedContactIds);

  if (result.error) {
    return [] as ClientRow[];
  }

  return (result.data ?? []) as ClientRow[];
}

async function loadClientSelfMatchesByEmail(
  supaService: any,
  actorEmail: string | null,
) {
  const email = String(actorEmail ?? "").trim().toLowerCase();
  if (!email) return [] as ClientRow[];

  const result = await supaService
    .from("clients")
    .select("id, name, holded_contact_id, contact_email")
    .ilike("contact_email", email);

  if (result.error) {
    return [] as ClientRow[];
  }

  return (result.data ?? []) as ClientRow[];
}

async function loadVisibleActorsForHoldedContacts(
  supaService: any,
  holdedContactIds: string[],
) {
  if (holdedContactIds.length === 0) return [] as ClientActorAssignmentRow[];

  const result = await supaService
    .from("client_actor_assignments_g1")
    .select(
      "actor_id, client_holded_contact_id, assignment_role, valid_from, valid_to, source",
    )
    .in("client_holded_contact_id", holdedContactIds)
    .is("valid_to", null);

  if (result.error) {
    return [] as ClientActorAssignmentRow[];
  }

  return (result.data ?? []) as ClientActorAssignmentRow[];
}

async function loadDelegateIdsForActors(
  supaService: any,
  actorIds: string[],
) {
  if (actorIds.length === 0) return [] as string[];

  const result = await supaService
    .from("delegates")
    .select("id, actor_id, active")
    .in("actor_id", actorIds);

  if (result.error) {
    return [] as string[];
  }

  return uniq(((result.data ?? []) as DelegateRow[]).map((row) => row.id));
}

function computeScopeMode(args: {
  roles: string[];
  permissions: DashboardPermissionFlags;
  visibleClientIds: string[];
  actorId: string;
  effectiveActorId: string;
  viewAsActive: boolean;
}) {
  const {
    roles,
    permissions,
    visibleClientIds,
    actorId,
    effectiveActorId,
    viewAsActive,
  } = args;

  if (viewAsActive && actorId !== effectiveActorId) return "view_as" as const;

  if (
    permissions.canViewGlobal &&
    (permissions.isSuperAdmin ||
      hasRole(roles, ["melquisedec", "super_admin"]))
  ) {
    return "global" as const;
  }

  if (
    hasRole(roles, [
      "coordinator",
      "coordinator_commercial",
      "coordinator_cect",
      "administrative",
      "administrativa",
    ]) &&
    visibleClientIds.length > 0
  ) {
    return "team" as const;
  }

  if (visibleClientIds.length > 0) {
    return "assigned" as const;
  }

  return "self" as const;
}

/**
 * Resolver canónico de contexto del dashboard.
 *
 * REGLAS:
 * - No inventa permisos; reutiliza getEffectivePermissionsByActorId.
 * - No inventa identidad; reutiliza getActorFromRequest.
 * - No depende de UI.
 * - Devuelve scope reutilizable para todos los endpoints del Control Room.
 *
 * ESTADO ACTUAL:
 * - view-as queda preparado pero no fuerza impersonación todavía,
 *   porque el flujo real servidor-side no está cableado aún en el repo operativo.
 * - cuando exista ese flujo real, solo habrá que sustituir la resolución
 *   de requestedViewAsActorId / effectiveActor.
 */
export async function resolveDashboardContext(
  req: Request,
): Promise<DashboardContext | DashboardContextError> {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as
      | ActorFromRequestOk
      | ActorFromRequestFail
      | any;

    if (!isOkActorFromRequest(ar)) {
      return {
        ok: false,
        status: Number(ar?.status ?? 401),
        error: String(ar?.error ?? "UNAUTHENTICATED"),
        stage,
      };
    }

    if (!ar.supaService) {
      return {
        ok: false,
        status: 500,
        error: "supaService missing in getActorFromRequest result",
        stage,
      };
    }

    const actorId = String(ar.actor.id);

    stage = "effective_permissions";
    const eff = (await getEffectivePermissionsByActorId(
      actorId,
    )) as PermissionSnapshot;

    stage = "roles";
    const roles = await loadOpenRoles(ar.supaService, actorId, ar.actor.role ?? null);

    stage = "permissions_flags";
    const permissions = buildPermissionFlags(eff);

    stage = "view_as_probe";
    const url = new URL(req.url);
    const requestedViewAsActorId = String(
      url.searchParams.get("view_as_actor_id") ??
        req.headers.get("x-view-as-actor-id") ??
        "",
    ).trim();

    // De momento: el flujo real servidor-side no está cableado.
    // Dejamos preparada la estructura sin cambiar el actor efectivo.
    const effectiveActor = ar.actor;
    const effectiveActorId = String(effectiveActor.id);
    const viewAsActive = false;

    stage = "delegate_ids_self";
    const selfDelegateIds = await loadDelegateIdsForActor(ar.supaService, effectiveActorId);

    stage = "client_actor_assignments";
    const actorAssignments = await loadClientAssignmentsForActor(
      ar.supaService,
      effectiveActorId,
    );

    const assignmentHoldedContactIds = uniq(
      actorAssignments.map((row) => row.client_holded_contact_id),
    );

    stage = "coordinator_assignments";
    const coordinatorAssignments = await loadCoordinatorAssignmentsForActor(
      ar.supaService,
      effectiveActorId,
    );

    const coordinatorClientIds = uniq(
      coordinatorAssignments
        .filter((row) => String(row.entity_type ?? "") === "client")
        .map((row) => row.entity_id),
    );

    stage = "coordinator_clients_to_holded";
    let coordinatorClients: ClientRow[] = [];
    if (coordinatorClientIds.length > 0) {
      const result = await ar.supaService
        .from("clients")
        .select("id, name, holded_contact_id, contact_email")
        .in("id", coordinatorClientIds);

      if (!result.error) {
        coordinatorClients = (result.data ?? []) as ClientRow[];
      }
    }

    const coordinatorHoldedContactIds = uniq(
      coordinatorClients.map((row) => row.holded_contact_id),
    );

    stage = "client_self_matches";
    const selfClientMatches = await loadClientSelfMatchesByEmail(
      ar.supaService,
      effectiveActor.email ?? null,
    );

    const selfClientIds = uniq(selfClientMatches.map((row) => row.id));
    const selfClientHoldedContactIds = uniq(
      selfClientMatches.map((row) => row.holded_contact_id),
    );

    stage = "all_visible_holded_contact_ids";
    const visibleClientHoldedContactIds = uniq([
      ...assignmentHoldedContactIds,
      ...coordinatorHoldedContactIds,
      ...selfClientHoldedContactIds,
    ]);

    stage = "clients_by_holded";
    const assignedClients = await loadClientsByHoldedContactIds(
      ar.supaService,
      visibleClientHoldedContactIds,
    );

    const visibleClientIds = uniq([
      ...assignedClients.map((row) => row.id),
      ...coordinatorClientIds,
      ...selfClientIds,
    ]);

    stage = "visible_actors_for_scope";
    const visibleActorAssignments = await loadVisibleActorsForHoldedContacts(
      ar.supaService,
      visibleClientHoldedContactIds,
    );

    const visibleActorIds = uniq([
      effectiveActorId,
      ...visibleActorAssignments.map((row) => row.actor_id),
    ]);

    stage = "delegate_ids_visible_actors";
    const visibleDelegateIds = uniq([
      ...selfDelegateIds,
      ...(await loadDelegateIdsForActors(ar.supaService, visibleActorIds)),
    ]);

    stage = "scope_mode";
    const mode = computeScopeMode({
      roles,
      permissions,
      visibleClientIds,
      actorId,
      effectiveActorId,
      viewAsActive,
    });

    return {
      ok: true,
      actor: {
        id: String(ar.actor.id),
        role: ar.actor.role ?? null,
        name: ar.actor.name ?? ar.actor.email ?? null,
        email: ar.actor.email ?? null,
        status: ar.actor.status ?? null,
        authMode: ar.authMode ?? "unknown",
      },
      effectiveActor: {
        id: String(effectiveActor.id),
        role: effectiveActor.role ?? null,
        name: effectiveActor.name ?? effectiveActor.email ?? null,
        email: effectiveActor.email ?? null,
        status: effectiveActor.status ?? null,
        authMode: ar.authMode ?? "unknown",
      },
      roles,
      permissions,
      scope: {
        mode,
        label: scopeLabel(mode),
        viewAs: {
          active: viewAsActive,
          requestedActorId: requestedViewAsActorId || null,
          effectiveActorId,
        },
        clientIds: visibleClientIds,
        clientHoldedContactIds: visibleClientHoldedContactIds,
        actorIds: visibleActorIds,
        delegateIds: visibleDelegateIds,
      },
      supaRls: ar.supaRls,
      supaService: ar.supaService,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 500,
      error: e?.message ?? "Unexpected error",
      stage,
    };
  }
}