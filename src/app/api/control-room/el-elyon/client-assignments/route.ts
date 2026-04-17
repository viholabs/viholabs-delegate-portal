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

type ClientRecommendationRow = {
  id: string;
  recommender_client_id: string;
  referred_client_id: string;
  percentage: number | string;
  active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  mode: "deduct" | "additive" | string;
  state_code: string;
};

type ActorCatalogRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
};

type AffiliateAccountRow = {
  id: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
  state_code: string | null;
};

type AffiliateClientEventRow = {
  id: string;
  source: string | null;
  source_event_id: string | null;
  client_id: string | null;
  affiliate_account_id: string | null;
  event_at: string | null;
  created_at: string;
  state_code: string;
  source_payload: Record<string, unknown> | null;
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

function hasRole(roles: string[], expected: string[]) {
  return roles.some((role) => expected.includes(role));
}

function canManageClientAssignmentsByRole(roles: string[]): boolean {
  return hasRole(roles, [
    "melquisedec",
    "super_admin",
    "delegate",
    "kol",
    "coordinator",
    "coordinator_commercial",
    "coordinator_cect",
    "administrative",
    "administrativa",
  ]);
}

function canManageInvoiceOverridesByRole(roles: string[]): boolean {
  return hasRole(roles, ["melquisedec"]);
}

function canReadClientAssignments(args: {
  eff: Awaited<ReturnType<typeof getEffectivePermissionsByActorId>>;
  roles: string[];
}) {
  const { eff, roles } = args;

  return (
    eff.isSuperAdmin ||
    eff.has("actors.read") ||
    eff.has("clients.read") ||
    eff.has("clients.manage") ||
    eff.has("control_room.delegates.read") ||
    eff.has("invoices.read") ||
    eff.has("invoices.manage") ||
    canManageClientAssignmentsByRole(roles) ||
    canManageInvoiceOverridesByRole(roles)
  );
}

function actorInfoFromAssignment(
  assignment: ClientAssignmentRow | null,
  actorById: Map<string, { id: string; name: string | null }>,
) {
  if (!assignment) return null;

  const actor = actorById.get(assignment.actor_id) ?? null;

  return {
    actorId: assignment.actor_id,
    actorName: actor?.name ?? null,
    source: assignment.source,
    validFrom: assignment.valid_from,
  };
}

function affiliateInfoFromEvent(
  event: AffiliateClientEventRow | null,
  affiliateById: Map<
    string,
    { id: string; name: string | null; email: string | null; affiliateExternalId: string | null }
  >,
) {
  if (!event?.affiliate_account_id) return null;

  const affiliate = affiliateById.get(String(event.affiliate_account_id)) ?? null;

  return {
    affiliateAccountId: String(event.affiliate_account_id),
    affiliateName: affiliate?.name ?? null,
    affiliateEmail: affiliate?.email ?? null,
    affiliateExternalId: affiliate?.affiliateExternalId ?? null,
    source: event.source ?? "manual_control_room",
    validFrom: event.event_at ?? event.created_at ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
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
    const eff = await getEffectivePermissionsByActorId(actorId);

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
    const canManageClientAssignments = canManageClientAssignmentsByRole(roles);
    const canManageInvoiceOverrides = canManageInvoiceOverridesByRole(roles);
    const allowed = canReadClientAssignments({ eff, roles });

    if (!allowed) {
      return json(403, {
        ok: false,
        error: "FORBIDDEN",
      });
    }

    const [
      clientsResult,
      assignmentsResult,
      recommendationsResult,
      actorsResult,
      allActorRolesResult,
      affiliatesResult,
      affiliateClientEventsResult,
    ] = await Promise.all([
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
        .in("assignment_role", [
          "delegate",
          "kol",
          "coordinator",
          "commissionist_1",
          "commissionist_2",
          "commissionist_3",
          "commissionist_4",
          "commissionist_5",
        ])
        .is("valid_to", null),

      resolved.supaService
        .from("client_recommendations")
        .select(
          "id, recommender_client_id, referred_client_id, percentage, active, valid_from, valid_to, notes, created_at, updated_at, mode, state_code",
        )
        .eq("active", true)
        .is("valid_to", null)
        .eq("state_code", "OPEN"),

      resolved.supaService
        .from("actors")
        .select("id, name, email, role, status")
        .order("name", { ascending: true }),

      resolved.supaService
        .from("actor_roles")
        .select("actor_id, role_code, is_primary, assigned_at, state_code")
        .eq("state_code", "OPEN"),

      resolved.supaService
        .from("affiliate_accounts")
        .select("id, name, email, affiliate_external_id, state_code")
        .eq("state_code", "OPEN")
        .order("name", { ascending: true }),

      resolved.supaService
        .from("affiliate_attribution_events")
        .select(
          "id, source, source_event_id, client_id, affiliate_account_id, event_at, created_at, state_code, source_payload",
        )
        .eq("source", "manual_control_room")
        .not("client_id", "is", null)
        .eq("state_code", "OPEN")
        .order("created_at", { ascending: false }),
    ]);

    if (clientsResult.error) {
      return json(500, { ok: false, error: clientsResult.error.message });
    }

    if (assignmentsResult.error) {
      return json(500, { ok: false, error: assignmentsResult.error.message });
    }

    if (recommendationsResult.error) {
      return json(500, { ok: false, error: recommendationsResult.error.message });
    }

    if (actorsResult.error) {
      return json(500, { ok: false, error: actorsResult.error.message });
    }

    if (allActorRolesResult.error) {
      return json(500, { ok: false, error: allActorRolesResult.error.message });
    }

    if (affiliatesResult.error) {
      return json(500, { ok: false, error: affiliatesResult.error.message });
    }

    if (affiliateClientEventsResult.error) {
      return json(500, { ok: false, error: affiliateClientEventsResult.error.message });
    }

    const clientRows = (clientsResult.data ?? []) as ClientRow[];
    const actorRows = (actorsResult.data ?? []) as ActorCatalogRow[];
    const actorRoleRows = (allActorRolesResult.data ?? []) as ActorRoleRow[];
    const activeAssignments = (assignmentsResult.data ?? []) as ClientAssignmentRow[];
    const activeRecommendations =
      (recommendationsResult.data ?? []) as ClientRecommendationRow[];
    const affiliateRows = (affiliatesResult.data ?? []) as AffiliateAccountRow[];
    const affiliateClientEvents =
      (affiliateClientEventsResult.data ?? []) as AffiliateClientEventRow[];

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

    // Operational delegates: those with at least one active client assignment.
    // This excludes test/inactive actors from the dropdown in ClientCommercialSection.
    // Safety valve: if none have assignments (fresh install), fall back to all with role.
    const assignedDelegateIds = new Set(
      activeAssignments
        .filter((a) => a.assignment_role === "delegate")
        .map((a) => a.actor_id)
    );
    const delegates = eligibleActors.filter(
      (row) =>
        row.roles.includes("delegate") &&
        (assignedDelegateIds.size === 0 || assignedDelegateIds.has(row.id))
    );

    const kols = eligibleActors.filter((row) => row.roles.includes("kol"));

    const coordinators = eligibleActors.filter((row) =>
      row.roles.some((role) =>
        ["coordinator", "coordinator_commercial", "coordinator_cect"].includes(role),
      ),
    );

    const commissionists = eligibleActors.filter((row) =>
      row.roles.some((role) =>
        [
          "commissionist",
          "commissionist_1",
          "commissionist_2",
          "commissionist_3",
          "commissionist_4",
          "commissionist_5",
        ].includes(role),
      ),
    );

    const delegateByHoldedContactId = new Map<string, ClientAssignmentRow>();
    const kolByHoldedContactId = new Map<string, ClientAssignmentRow>();
    const coordinatorByHoldedContactId = new Map<string, ClientAssignmentRow>();

    const commission1ByHoldedContactId = new Map<string, ClientAssignmentRow>();
    const commission2ByHoldedContactId = new Map<string, ClientAssignmentRow>();
    const commission3ByHoldedContactId = new Map<string, ClientAssignmentRow>();
    const commission4ByHoldedContactId = new Map<string, ClientAssignmentRow>();
    const commission5ByHoldedContactId = new Map<string, ClientAssignmentRow>();

    for (const row of activeAssignments) {
      if (row.assignment_role === "delegate") {
        delegateByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "kol") {
        kolByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "coordinator") {
        coordinatorByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "commissionist_1") {
        commission1ByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "commissionist_2") {
        commission2ByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "commissionist_3") {
        commission3ByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "commissionist_4") {
        commission4ByHoldedContactId.set(row.client_holded_contact_id, row);
      }
      if (row.assignment_role === "commissionist_5") {
        commission5ByHoldedContactId.set(row.client_holded_contact_id, row);
      }
    }

    const actorById = new Map(
      eligibleActors.map((row) => [row.id, { id: row.id, name: row.name }]),
    );

    const clientById = new Map(clientRows.map((row) => [row.id, row]));
    const recommenderByReferredClientId = new Map<string, ClientRecommendationRow>();

    for (const row of activeRecommendations) {
      recommenderByReferredClientId.set(row.referred_client_id, row);
    }

    const affiliateById = new Map(
      affiliateRows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          email: row.email,
          affiliateExternalId: row.affiliate_external_id,
        },
      ]),
    );

    const currentAffiliateEventByClientId = new Map<string, AffiliateClientEventRow>();

    for (const row of affiliateClientEvents) {
      const clientId = String(row.client_id ?? "").trim();
      if (!clientId) continue;
      if (currentAffiliateEventByClientId.has(clientId)) continue;
      currentAffiliateEventByClientId.set(clientId, row);
    }

    const recommenderClients = clientRows.map((client) => ({
      id: client.id,
      name: client.name,
      holdedContactId: client.holded_contact_id ?? "",
    }));

    const affiliates = affiliateRows.map((row) => ({
      id: row.id,
      label: [row.name?.trim(), row.email?.trim(), row.affiliate_external_id?.trim()]
        .filter(Boolean)
        .join(" · "),
      name: row.name,
      email: row.email,
      affiliate_external_id: row.affiliate_external_id,
    }));

    const clients = clientRows.map((client) => {
      const holdedContactId = client.holded_contact_id ?? "";

      const delegateAssignment = delegateByHoldedContactId.get(holdedContactId) ?? null;
      const kolAssignment = kolByHoldedContactId.get(holdedContactId) ?? null;
      const coordinatorAssignment =
        coordinatorByHoldedContactId.get(holdedContactId) ?? null;

      const commission1Assignment = commission1ByHoldedContactId.get(holdedContactId) ?? null;
      const commission2Assignment = commission2ByHoldedContactId.get(holdedContactId) ?? null;
      const commission3Assignment = commission3ByHoldedContactId.get(holdedContactId) ?? null;
      const commission4Assignment = commission4ByHoldedContactId.get(holdedContactId) ?? null;
      const commission5Assignment = commission5ByHoldedContactId.get(holdedContactId) ?? null;

      const recommenderRecommendation = recommenderByReferredClientId.get(client.id) ?? null;

      const recommenderClient = recommenderRecommendation
        ? clientById.get(recommenderRecommendation.recommender_client_id) ?? null
        : null;

      const currentAffiliateEvent = currentAffiliateEventByClientId.get(client.id) ?? null;

      return {
        id: client.id,
        name: client.name,
        holdedContactId,

        delegate: actorInfoFromAssignment(delegateAssignment, actorById),

        recommender: recommenderRecommendation
          ? {
              clientId: recommenderRecommendation.recommender_client_id,
              clientName: recommenderClient?.name ?? null,
              source: recommenderRecommendation.mode ?? "deduct",
              validFrom: recommenderRecommendation.valid_from,
            }
          : null,

        affiliate: affiliateInfoFromEvent(currentAffiliateEvent, affiliateById),

        kol: actorInfoFromAssignment(kolAssignment, actorById),
        coordinator: actorInfoFromAssignment(coordinatorAssignment, actorById),

        commissionist_1: actorInfoFromAssignment(commission1Assignment, actorById),
        commissionist_2: actorInfoFromAssignment(commission2Assignment, actorById),
        commissionist_3: actorInfoFromAssignment(commission3Assignment, actorById),
        commissionist_4: actorInfoFromAssignment(commission4Assignment, actorById),
        commissionist_5: actorInfoFromAssignment(commission5Assignment, actorById),
      };
    });

    return json(200, {
      ok: true,
      viewer: {
        actorId: resolved.actor.id,
        actorName: resolved.actor.name ?? null,
        roles,
        canManageClientAssignments,
        canManageInvoiceOverrides,
      },
      dictionaries: {
        delegates,
        recommenders: recommenderClients,
        affiliates,
        kols,
        coordinators,
        commissionists,
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