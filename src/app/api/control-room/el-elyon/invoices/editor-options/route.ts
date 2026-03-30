// src/app/api/control-room/el-elyon/invoices/editor-options/route.ts

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

type ActorRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  state_code: string;
};

type AffiliateRow = {
  id: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
  state_code: string;
};

type ActorOption = {
  id: string;
  label: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

type AffiliateOption = {
  id: string;
  label: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
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

function safeText(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeRole(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasAnyRole(roles: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => roles.has(candidate));
}

async function loadActorRoles(
  supaService: any,
  actorId: string,
  baseRole: string | null,
): Promise<Set<string>> {
  const roles = new Set<string>();

  const normalizedBaseRole = normalizeRole(baseRole);
  if (normalizedBaseRole) roles.add(normalizedBaseRole);

  const { data, error } = await supaService
    .from("actor_roles")
    .select("actor_id, role_code, state_code")
    .eq("actor_id", actorId)
    .eq("state_code", "OPEN");

  if (error) {
    throw new Error(`actor_roles: ${error.message}`);
  }

  for (const row of data ?? []) {
    const role = normalizeRole((row as any)?.role_code);
    if (role) roles.add(role);
  }

  return roles;
}

function actorLabel(row: ActorRow): string {
  const name = safeText(row.name);
  const email = safeText(row.email);
  const role = safeText(row.role);

  if (name && role) return `${name} · ${role}`;
  if (name && email) return `${name} · ${email}`;
  if (name) return name;
  if (email && role) return `${email} · ${role}`;
  if (email) return email;
  if (role) return `${role} · ${row.id}`;
  return row.id;
}

function affiliateLabel(row: AffiliateRow): string {
  const name = safeText(row.name);
  const email = safeText(row.email);
  const ext = safeText(row.affiliate_external_id);

  if (name && ext) return `${name} · ${ext}`;
  if (name && email) return `${name} · ${email}`;
  if (name) return name;
  if (email && ext) return `${email} · ${ext}`;
  if (email) return email;
  if (ext) return ext;
  return row.id;
}

export async function GET(req: NextRequest) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as
      | ActorFromRequestOk
      | ActorFromRequestFail
      | unknown;

    if (!isOk(ar)) {
      const fail = ar as ActorFromRequestFail | undefined;

      return json(fail?.status ?? 401, {
        ok: false,
        stage,
        error: fail?.error ?? "No autenticado",
      });
    }

    const actorId = String(ar.actor.id);

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(actorId);

    stage = "roles";
    const roles = await loadActorRoles(ar.supaService, actorId, ar.actor.role ?? null);

    const allowed =
      eff.isSuperAdmin ||
      eff.has("invoices.manage") ||
      eff.has("control_room.invoices.manage") ||
      eff.has("control_room.invoices.read") ||
      eff.has("actors.read") ||
      hasAnyRole(roles, [
        "melquisedec",
        "super_admin",
        "administrative",
        "administrativa",
        "coordinator_commercial",
        "coordinator_cect",
      ]);

    if (!allowed) {
      return json(403, {
        ok: false,
        stage: "authorize",
        error: "No autorizado para consultar opciones de edición",
      });
    }

    stage = "query_actors";
    const { data: actorData, error: actorError } = await ar.supaService
      .from("actors")
      .select("id, name, email, role, state_code")
      .eq("state_code", "OPEN")
      .order("name", { ascending: true });

    if (actorError) {
      return json(500, {
        ok: false,
        stage,
        error: actorError.message,
      });
    }

    stage = "query_affiliates";
    const { data: affiliateData, error: affiliateError } = await ar.supaService
      .from("affiliate_accounts")
      .select("id, name, email, affiliate_external_id, state_code")
      .eq("state_code", "OPEN")
      .order("name", { ascending: true });

    if (affiliateError) {
      return json(500, {
        ok: false,
        stage,
        error: affiliateError.message,
      });
    }

    const actors: ActorOption[] = ((actorData ?? []) as ActorRow[]).map((row) => ({
      id: row.id,
      label: actorLabel(row),
      name: row.name ?? null,
      email: row.email ?? null,
      role: row.role ?? null,
    }));

    const affiliates: AffiliateOption[] = ((affiliateData ?? []) as AffiliateRow[]).map(
      (row) => ({
        id: row.id,
        label: affiliateLabel(row),
        name: row.name ?? null,
        email: row.email ?? null,
        affiliate_external_id: row.affiliate_external_id ?? null,
      }),
    );

    return json(200, {
      ok: true,
      actors,
      affiliates,
    });
  } catch (err) {
    return json(500, {
      ok: false,
      stage,
      error: err instanceof Error ? err.message : "Error inesperado",
    });
  }
}