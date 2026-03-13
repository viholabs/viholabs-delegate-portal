import { NextRequest, NextResponse } from "next/server";
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

type ClientAssignmentRow = {
  actor_id: string;
  client_holded_contact_id: string;
  assignment_role: string;
  valid_from: string | null;
  valid_to: string | null;
  source: string | null;
};

type RequestBody = {
  clientHoldedContactId: string;
  assignmentRole: "delegate" | "recommender";
  actorId: string | null;
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveCurrentActor();

    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, error: resolved.error },
        { status: resolved.status },
      );
    }

    const { supabase, roles } = resolved;

    if (!hasPrivilegedRole(roles)) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as RequestBody;

    const clientHoldedContactId = body.clientHoldedContactId?.trim();
    const assignmentRole = body.assignmentRole;
    const actorId = body.actorId?.trim() || null;

    if (!clientHoldedContactId) {
      return NextResponse.json(
        { ok: false, error: "CLIENT_HOLDED_CONTACT_ID_REQUIRED" },
        { status: 400 },
      );
    }

    if (!["delegate", "recommender"].includes(assignmentRole)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_ASSIGNMENT_ROLE" },
        { status: 400 },
      );
    }

    const clientResult = await supabase
      .from("clients")
      .select("id, holded_contact_id")
      .eq("holded_contact_id", clientHoldedContactId)
      .maybeSingle();

    if (clientResult.error || !clientResult.data) {
      return NextResponse.json(
        { ok: false, error: "CLIENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    const activeAssignmentResult = await supabase
      .from("client_actor_assignments_g1")
      .select("actor_id, client_holded_contact_id, assignment_role, valid_from, valid_to, source")
      .eq("client_holded_contact_id", clientHoldedContactId)
      .eq("assignment_role", assignmentRole)
      .is("valid_to", null)
      .maybeSingle<ClientAssignmentRow>();

    if (activeAssignmentResult.error) {
      return NextResponse.json(
        { ok: false, error: activeAssignmentResult.error.message },
        { status: 500 },
      );
    }

    const currentActive = activeAssignmentResult.data ?? null;

    if (!actorId) {
      if (!currentActive) {
        return NextResponse.json({ ok: true, changed: false });
      }

      const closeResult = await supabase
        .from("client_actor_assignments_g1")
        .update({
          valid_to: todayIsoDate(),
          source: `${currentActive.source ?? "el_elyon_manual_assignment"}__closed_2026_03_10`,
        })
        .eq("client_holded_contact_id", clientHoldedContactId)
        .eq("assignment_role", assignmentRole)
        .is("valid_to", null);

      if (closeResult.error) {
        return NextResponse.json(
          { ok: false, error: closeResult.error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, changed: true });
    }

    const actorResult = await supabase
      .from("actors")
      .select("id, role")
      .eq("id", actorId)
      .maybeSingle();

    if (actorResult.error || !actorResult.data) {
      return NextResponse.json(
        { ok: false, error: "TARGET_ACTOR_NOT_FOUND" },
        { status: 404 },
      );
    }

    const roleCheckResult = await supabase
      .from("actor_roles")
      .select("actor_id, role_code, state_code")
      .eq("actor_id", actorId)
      .eq("state_code", "OPEN");

    if (roleCheckResult.error) {
      return NextResponse.json(
        { ok: false, error: roleCheckResult.error.message },
        { status: 500 },
      );
    }

    const targetRoles = new Set<string>();
    const baseRole = normalizeRole(actorResult.data.role);
    if (baseRole) targetRoles.add(baseRole);

    for (const row of roleCheckResult.data ?? []) {
      const roleValue = normalizeRole(row.role_code);
      if (roleValue) targetRoles.add(roleValue);
    }

    if (!targetRoles.has(assignmentRole)) {
      return NextResponse.json(
        { ok: false, error: "TARGET_ACTOR_DOES_NOT_HAVE_REQUIRED_ROLE" },
        { status: 400 },
      );
    }

    if (currentActive?.actor_id === actorId) {
      return NextResponse.json({ ok: true, changed: false });
    }

    if (currentActive) {
      const closeResult = await supabase
        .from("client_actor_assignments_g1")
        .update({
          valid_to: todayIsoDate(),
        })
        .eq("client_holded_contact_id", clientHoldedContactId)
        .eq("assignment_role", assignmentRole)
        .is("valid_to", null);

      if (closeResult.error) {
        return NextResponse.json(
          { ok: false, error: closeResult.error.message },
          { status: 500 },
        );
      }
    }

    const insertResult = await supabase
      .from("client_actor_assignments_g1")
      .insert({
        client_holded_contact_id: clientHoldedContactId,
        actor_id: actorId,
        assignment_role: assignmentRole,
        valid_from: todayIsoDate(),
        valid_to: null,
        source: "el_elyon_manual_assignment_2026_03_10",
      });

    if (insertResult.error) {
      return NextResponse.json(
        { ok: false, error: insertResult.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, changed: true });
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