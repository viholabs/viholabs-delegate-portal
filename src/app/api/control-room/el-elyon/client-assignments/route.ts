import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

type ActorRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  auth_user_id: string | null;
};

type ActorRoleRow = {
  actor_id: string;
  role_code: string | null;
  is_primary: boolean | null;
  assigned_at: string | null;
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

function normalizeRole(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function hasPrivilegedRole(roles: string[]): boolean {
  return roles.some((role) =>
    ["melquisedec", "super_admin", "coordinator", "administrative"].includes(role),
  );
}

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Faltan variables de entorno de Supabase.");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {}
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {}
      },
    },
  });
}

async function resolveCurrentActor() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      status: 401,
      error: "UNAUTHENTICATED",
    };
  }

  const actorResult = await supabase
    .from("actors")
    .select("id, name, email, role, status, auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle<ActorRow>();

  if (actorResult.error || !actorResult.data) {
    return {
      ok: false as const,
      status: 404,
      error: "ACTOR_NOT_FOUND",
    };
  }

  const actor = actorResult.data;

  const rolesSet = new Set<string>();
  const baseRole = normalizeRole(actor.role);
  if (baseRole) rolesSet.add(baseRole);

  const actorRolesResult = await supabase
    .from("actor_roles")
    .select("actor_id, role_code, is_primary, assigned_at, state_code")
    .eq("actor_id", actor.id)
    .eq("state_code", "OPEN");

  if (!actorRolesResult.error && Array.isArray(actorRolesResult.data)) {
    for (const row of actorRolesResult.data as ActorRoleRow[]) {
      const role = normalizeRole(row.role_code);
      if (role) rolesSet.add(role);
    }
  }

  return {
    ok: true as const,
    supabase,
    actor,
    roles: Array.from(rolesSet),
  };
}

export async function GET() {
  try {
    const resolved = await resolveCurrentActor();

    if (!resolved.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: resolved.error,
        },
        { status: resolved.status },
      );
    }

    const { supabase, actor, roles } = resolved;

    if (!hasPrivilegedRole(roles)) {
      return NextResponse.json(
        {
          ok: false,
          error: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const [clientsResult, assignmentsResult, actorsResult, actorRolesResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, holded_contact_id")
        .not("holded_contact_id", "is", null)
        .order("name", { ascending: true }),

      supabase
        .from("client_actor_assignments_g1")
        .select("actor_id, client_holded_contact_id, assignment_role, valid_from, valid_to, source")
        .in("assignment_role", ["delegate", "recommender"])
        .is("valid_to", null),

      supabase
        .from("actors")
        .select("id, name, email, role, status")
        .order("name", { ascending: true }),

      supabase
        .from("actor_roles")
        .select("actor_id, role_code, is_primary, assigned_at, state_code")
        .eq("state_code", "OPEN"),
    ]);

    if (clientsResult.error) {
      return NextResponse.json(
        { ok: false, error: clientsResult.error.message },
        { status: 500 },
      );
    }

    if (assignmentsResult.error) {
      return NextResponse.json(
        { ok: false, error: assignmentsResult.error.message },
        { status: 500 },
      );
    }

    if (actorsResult.error) {
      return NextResponse.json(
        { ok: false, error: actorsResult.error.message },
        { status: 500 },
      );
    }

    if (actorRolesResult.error) {
      return NextResponse.json(
        { ok: false, error: actorRolesResult.error.message },
        { status: 500 },
      );
    }

    const actorRows = (actorsResult.data ?? []) as Array<{
      id: string;
      name: string | null;
      email: string | null;
      role: string | null;
      status: string | null;
    }>;

    const actorRoleRows = (actorRolesResult.data ?? []) as ActorRoleRow[];
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
    const coordinators = eligibleActors.filter((row) => row.roles.includes("coordinator"));

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
        holdedContactId: holdedContactId,
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

    return NextResponse.json({
      ok: true,
      viewer: {
        actorId: actor.id,
        actorName: actor.name,
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
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      },
      { status: 500 },
    );
  }
}