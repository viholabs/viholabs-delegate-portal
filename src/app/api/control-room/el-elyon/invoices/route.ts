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
  state_code: string | null;
};

type InvoiceRow = {
  id: string;
  client_id: string | null;
  delegate_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  total_net: number | string | null;
  total_gross: number | string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  source_month: string | null;
  source_provider: string | null;
  client_name: string | null;
  source_channel: string | null;
  recommender_id: string | null;
};

type InvoiceStateRow = {
  id: string;
  state_code: string | null;
};

type AffiliateAttributionRow = {
  invoice_id: string;
  affiliate_account_id: string | null;
  state_code: string | null;
  effective_at: string | null;
};

type ActorNameRow = {
  id: string;
  name: string | null;
};

type ClientDelegateCurrentRow = {
  client_id: string;
  delegate_actor_id: string | null;
  delegate_name: string | null;
  delegate_email: string | null;
  delegate_valid_from: string | null;
  delegate_source: string | null;
};

type InvoiceActorAssignmentRow = {
  id: string;
  invoice_id: string;
  role:
    | "COORDINATOR_COMMERCIAL"
    | "COORDINATOR_CECT"
    | "RECOMMENDER"
    | "COMMISSIONIST_1"
    | "COMMISSIONIST_2"
    | "COMMISSIONIST_3"
    | "COMMISSIONIST_4"
    | "COMMISSIONIST_5"
    | "AFFILIATE"
    | "DELEGATE"
    | null;
  actor_id: string | null;
  apply_to_client: boolean | null;
  created_at: string | null;
  created_by: string | null;
  state_code: string | null;
};

type InvoiceAffiliateAssignmentRow = {
  id: string;
  invoice_id: string;
  affiliate_account_id: string | null;
  apply_to_client: boolean | null;
  created_at: string | null;
  created_by: string | null;
  state_code: string | null;
};

type AffiliateAccountRow = {
  id: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
};

type ElElyonInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  client_id: string | null;
  client_name: string | null;

  delegate_id: string | null;
  delegate_name: string | null;
  delegate_source: "OVERRIDE_INVOICE" | "INVOICE_BASE" | "CLIENT_CURRENT" | "NONE";

  recommender_id: string | null;
  recommender_name: string | null;
  recommender_source: "OVERRIDE_INVOICE" | "INVOICE_BASE" | "NONE";

  affiliate_account_id: string | null;
  affiliate_name: string | null;
  affiliate_source: "OVERRIDE_INVOICE" | "ATTRIBUTION_CURRENT" | "NONE";

  source_provider: string | null;
  source_channel: string | null;

  state_code: string | null;
  source_month: string | null;
  total_net: number | string | null;
  total_gross: number | string | null;
  currency: string | null;
  is_paid: boolean | null;
  paid_date: string | null;

  override_meta: {
    delegate_assignment_id: string | null;
    recommender_assignment_id: string | null;
    affiliate_assignment_id: string | null;
  };
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

function normalizeRole(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasAnyRole(roles: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => roles.has(candidate));
}

function toIdSet(values: Array<unknown>): Set<string> {
  const out = new Set<string>();

  for (const value of values) {
    const id = String(value ?? "").trim();
    if (id) out.add(id);
  }

  return out;
}

function safeId(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function byCreatedAtDesc<T extends { created_at: string | null }>(a: T, b: T) {
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
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

  for (const row of (data ?? []) as ActorRoleRow[]) {
    const role = normalizeRole(row.role_code);
    if (role) roles.add(role);
  }

  return roles;
}

async function loadDelegateScopeClientIds(
  supaService: any,
  actorId: string,
): Promise<Set<string>> {
  const { data, error } = await supaService
    .from("v_delegate_client_scope_current")
    .select("client_id")
    .eq("delegate_actor_id", actorId)
    .eq("active", true);

  if (error) {
    throw new Error(`v_delegate_client_scope_current: ${error.message}`);
  }

  return toIdSet((data ?? []).map((row: any) => row?.client_id));
}

async function loadKolScopeClientIds(
  supaService: any,
  actorId: string,
): Promise<Set<string>> {
  const { data, error } = await supaService
    .from("v_kol_client_scope_current")
    .select("client_id")
    .eq("kol_actor_id", actorId)
    .eq("active", true);

  if (error) {
    throw new Error(`v_kol_client_scope_current: ${error.message}`);
  }

  return toIdSet((data ?? []).map((row: any) => row?.client_id));
}

async function loadVisibleClientIds(args: {
  supaService: any;
  actorId: string;
  roles: Set<string>;
  unrestricted: boolean;
}): Promise<Set<string> | null> {
  const { supaService, actorId, roles, unrestricted } = args;

  if (unrestricted) {
    return null;
  }

  const visible = new Set<string>();

  if (hasAnyRole(roles, ["delegate"])) {
    const delegateIds = await loadDelegateScopeClientIds(supaService, actorId);
    for (const id of delegateIds) visible.add(id);
  }

  if (hasAnyRole(roles, ["kol"])) {
    const kolIds = await loadKolScopeClientIds(supaService, actorId);
    for (const id of kolIds) visible.add(id);
  }

  return visible;
}

async function loadActorNamesById(
  supaService: any,
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();

  if (ids.length === 0) return out;

  const { data, error } = await supaService
    .from("actors")
    .select("id, name")
    .in("id", ids);

  if (error) {
    throw new Error(`actors: ${error.message}`);
  }

  for (const row of (data ?? []) as ActorNameRow[]) {
    out.set(String(row.id), row.name ?? null);
  }

  return out;
}

async function loadAffiliateNamesById(
  supaService: any,
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();

  if (ids.length === 0) return out;

  const { data, error } = await supaService
    .from("affiliate_accounts")
    .select("id, name, email, affiliate_external_id")
    .in("id", ids);

  if (error) {
    throw new Error(`affiliate_accounts: ${error.message}`);
  }

  for (const row of (data ?? []) as AffiliateAccountRow[]) {
    const label =
      row.name?.trim() ||
      row.email?.trim() ||
      row.affiliate_external_id?.trim() ||
      String(row.id);

    out.set(String(row.id), label || null);
  }

  return out;
}

async function loadInvoiceStatesById(
  supaService: any,
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();

  if (ids.length === 0) return out;

  const { data, error } = await supaService
    .from("invoices")
    .select("id, state_code")
    .in("id", ids);

  if (error) {
    throw new Error(`invoices(state_code): ${error.message}`);
  }

  for (const row of (data ?? []) as InvoiceStateRow[]) {
    out.set(String(row.id), row.state_code ?? null);
  }

  return out;
}

async function loadCurrentClientDelegatesByClientId(
  supaService: any,
  clientIds: string[],
): Promise<Map<string, ClientDelegateCurrentRow>> {
  const out = new Map<string, ClientDelegateCurrentRow>();

  if (clientIds.length === 0) return out;

  const { data, error } = await supaService
    .from("v_control_room_clients_by_delegate_current")
    .select(
      "client_id, delegate_actor_id, delegate_name, delegate_email, delegate_valid_from, delegate_source",
    )
    .in("client_id", clientIds);

  if (error) {
    throw new Error(`v_control_room_clients_by_delegate_current: ${error.message}`);
  }

  for (const row of (data ?? []) as ClientDelegateCurrentRow[]) {
    const clientId = String(row?.client_id ?? "").trim();
    if (!clientId) continue;
    out.set(clientId, row);
  }

  return out;
}

async function loadInvoiceActorAssignmentsByInvoiceId(
  supaService: any,
  invoiceIds: string[],
): Promise<Map<string, InvoiceActorAssignmentRow[]>> {
  const out = new Map<string, InvoiceActorAssignmentRow[]>();

  if (invoiceIds.length === 0) return out;

  const { data, error } = await supaService
    .from("invoice_actor_assignments")
    .select("id, invoice_id, role, actor_id, apply_to_client, created_at, created_by, state_code")
    .in("invoice_id", invoiceIds)
    .eq("state_code", "OPEN")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`invoice_actor_assignments: ${error.message}`);
  }

  for (const row of (data ?? []) as InvoiceActorAssignmentRow[]) {
    const invoiceId = String(row.invoice_id ?? "").trim();
    if (!invoiceId) continue;

    const list = out.get(invoiceId) ?? [];
    list.push(row);
    out.set(invoiceId, list);
  }

  return out;
}

async function loadInvoiceAffiliateAssignmentsByInvoiceId(
  supaService: any,
  invoiceIds: string[],
): Promise<Map<string, InvoiceAffiliateAssignmentRow[]>> {
  const out = new Map<string, InvoiceAffiliateAssignmentRow[]>();

  if (invoiceIds.length === 0) return out;

  const { data, error } = await supaService
    .from("invoice_affiliate_assignments")
    .select("id, invoice_id, affiliate_account_id, apply_to_client, created_at, created_by, state_code")
    .in("invoice_id", invoiceIds)
    .eq("state_code", "OPEN")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`invoice_affiliate_assignments: ${error.message}`);
  }

  for (const row of (data ?? []) as InvoiceAffiliateAssignmentRow[]) {
    const invoiceId = String(row.invoice_id ?? "").trim();
    if (!invoiceId) continue;

    const list = out.get(invoiceId) ?? [];
    list.push(row);
    out.set(invoiceId, list);
  }

  return out;
}

function pickLatestActorAssignmentByRole(
  rows: InvoiceActorAssignmentRow[],
  role: InvoiceActorAssignmentRow["role"],
): InvoiceActorAssignmentRow | null {
  const filtered = rows.filter((row) => row.role === role).sort(byCreatedAtDesc);
  return filtered[0] ?? null;
}

function pickLatestAffiliateAssignment(
  rows: InvoiceAffiliateAssignmentRow[],
): InvoiceAffiliateAssignmentRow | null {
  return [...rows].sort(byCreatedAtDesc)[0] ?? null;
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

    const unrestricted =
      eff.isSuperAdmin || hasAnyRole(roles, ["administrative", "administrativa"]);

    const canReadInvoices =
      unrestricted ||
      hasAnyRole(roles, ["delegate", "kol"]) ||
      eff.has("control_room.invoices.read") ||
      eff.has("invoices.read") ||
      eff.has("invoices.manage") ||
      eff.has("actors.read");

    if (!canReadInvoices) {
      return json(403, {
        ok: false,
        stage: "authorize",
        error: "No autorizado (control_room.invoices.read)",
      });
    }

    const { searchParams } = new URL(req.url);

    const month =
      searchParams.get("month") ||
      searchParams.get("source_month") ||
      new Date().toISOString().slice(0, 7);

    stage = "visible_client_ids";
    const visibleClientIds = await loadVisibleClientIds({
      supaService: ar.supaService,
      actorId,
      roles,
      unrestricted,
    });

    if (!unrestricted && visibleClientIds && visibleClientIds.size === 0) {
      return json(200, {
        ok: true,
        month,
        count: 0,
        rows: [],
        viewer: {
          actor_id: actorId,
          roles: Array.from(roles),
          unrestricted,
        },
      });
    }

    stage = "query_invoices";
    let query = ar.supaService
      .from("v_invoices_with_kpis_and_roles")
      .select(`
        id,
        client_id,
        delegate_id,
        invoice_number,
        invoice_date,
        currency,
        total_net,
        total_gross,
        is_paid,
        paid_date,
        source_month,
        source_provider,
        client_name,
        source_channel,
        recommender_id
      `)
      .eq("source_provider", "holded")
      .eq("source_month", month)
      .order("invoice_date", { ascending: false })
      .order("invoice_number", { ascending: false });

    if (!unrestricted && visibleClientIds) {
      query = query.in("client_id", Array.from(visibleClientIds));
    }

    const { data, error } = await query;

    if (error) {
      return json(500, {
        ok: false,
        stage,
        error: error.message,
      });
    }

    const invoiceRows = (data ?? []) as InvoiceRow[];

    const invoiceIds = invoiceRows
      .map((row) => String(row?.id ?? "").trim())
      .filter((id) => id.length > 0);

    const clientIds = Array.from(toIdSet(invoiceRows.map((row) => row.client_id)));

    stage = "resolve_related_data";
    const [
      invoiceStatesById,
      clientDelegatesByClientId,
      actorAssignmentsByInvoiceId,
      affiliateAssignmentsByInvoiceId,
    ] = await Promise.all([
      loadInvoiceStatesById(ar.supaService, invoiceIds),
      loadCurrentClientDelegatesByClientId(ar.supaService, clientIds),
      loadInvoiceActorAssignmentsByInvoiceId(ar.supaService, invoiceIds),
      loadInvoiceAffiliateAssignmentsByInvoiceId(ar.supaService, invoiceIds),
    ]);

    const effectiveDelegateIds = new Set<string>();
    const effectiveRecommenderIds = new Set<string>();
    const effectiveAffiliateIds = new Set<string>();

    const baseAffiliateByInvoiceId = new Map<string, string | null>();

    if (invoiceIds.length > 0) {
      stage = "query_affiliate_attribution";
      const { data: affData, error: affError } = await ar.supaService
        .from("v_affiliate_attribution_current_v1")
        .select("invoice_id, affiliate_account_id, state_code, effective_at")
        .in("invoice_id", invoiceIds);

      if (affError) {
        return json(500, {
          ok: false,
          stage,
          error: affError.message,
        });
      }

      for (const row of (affData ?? []) as AffiliateAttributionRow[]) {
        const invoiceId = String(row?.invoice_id ?? "").trim();
        if (!invoiceId) continue;

        const affiliateId = row?.affiliate_account_id
          ? String(row.affiliate_account_id).trim()
          : null;

        baseAffiliateByInvoiceId.set(invoiceId, affiliateId);

        if (affiliateId) {
          effectiveAffiliateIds.add(affiliateId);
        }
      }
    }

    for (const row of invoiceRows) {
      const invoiceAssignments = actorAssignmentsByInvoiceId.get(String(row.id)) ?? [];
      const affiliateAssignments =
        affiliateAssignmentsByInvoiceId.get(String(row.id)) ?? [];

      const delegateOverride = pickLatestActorAssignmentByRole(
        invoiceAssignments,
        "DELEGATE",
      );
      const recommenderOverride = pickLatestActorAssignmentByRole(
        invoiceAssignments,
        "RECOMMENDER",
      );
      const affiliateOverride = pickLatestAffiliateAssignment(affiliateAssignments);

      const clientDelegate = clientDelegatesByClientId.get(String(row.client_id ?? ""));

      const effectiveDelegateId =
        safeId(delegateOverride?.actor_id) ||
        safeId(row.delegate_id) ||
        safeId(clientDelegate?.delegate_actor_id);

      if (effectiveDelegateId) {
        effectiveDelegateIds.add(effectiveDelegateId);
      }

      const effectiveRecommenderId =
        safeId(recommenderOverride?.actor_id) || safeId(row.recommender_id);

      if (effectiveRecommenderId) {
        effectiveRecommenderIds.add(effectiveRecommenderId);
      }

      const effectiveAffiliateId =
        safeId(affiliateOverride?.affiliate_account_id) ||
        safeId(baseAffiliateByInvoiceId.get(String(row.id)));

      if (effectiveAffiliateId) {
        effectiveAffiliateIds.add(effectiveAffiliateId);
      }
    }

    const [delegateNamesById, recommenderNamesById, affiliateNamesById] =
      await Promise.all([
        loadActorNamesById(ar.supaService, Array.from(effectiveDelegateIds)),
        loadActorNamesById(ar.supaService, Array.from(effectiveRecommenderIds)),
        loadAffiliateNamesById(ar.supaService, Array.from(effectiveAffiliateIds)),
      ]);

    const rows: ElElyonInvoiceRow[] = invoiceRows.map((row) => {
      const invoiceAssignments = actorAssignmentsByInvoiceId.get(String(row.id)) ?? [];
      const affiliateAssignments =
        affiliateAssignmentsByInvoiceId.get(String(row.id)) ?? [];

      const delegateOverride = pickLatestActorAssignmentByRole(
        invoiceAssignments,
        "DELEGATE",
      );
      const recommenderOverride = pickLatestActorAssignmentByRole(
        invoiceAssignments,
        "RECOMMENDER",
      );
      const affiliateOverride = pickLatestAffiliateAssignment(affiliateAssignments);

      const clientDelegate = clientDelegatesByClientId.get(String(row.client_id ?? ""));

      const effectiveDelegateId =
        safeId(delegateOverride?.actor_id) ||
        safeId(row.delegate_id) ||
        safeId(clientDelegate?.delegate_actor_id);

      const effectiveDelegateSource: ElElyonInvoiceRow["delegate_source"] =
        safeId(delegateOverride?.actor_id)
          ? "OVERRIDE_INVOICE"
          : safeId(row.delegate_id)
            ? "INVOICE_BASE"
            : safeId(clientDelegate?.delegate_actor_id)
              ? "CLIENT_CURRENT"
              : "NONE";

      const effectiveRecommenderId =
        safeId(recommenderOverride?.actor_id) || safeId(row.recommender_id);

      const effectiveRecommenderSource: ElElyonInvoiceRow["recommender_source"] =
        safeId(recommenderOverride?.actor_id)
          ? "OVERRIDE_INVOICE"
          : safeId(row.recommender_id)
            ? "INVOICE_BASE"
            : "NONE";

      const baseAffiliateId = safeId(baseAffiliateByInvoiceId.get(String(row.id)));
      const effectiveAffiliateId =
        safeId(affiliateOverride?.affiliate_account_id) || baseAffiliateId;

      const effectiveAffiliateSource: ElElyonInvoiceRow["affiliate_source"] =
        safeId(affiliateOverride?.affiliate_account_id)
          ? "OVERRIDE_INVOICE"
          : baseAffiliateId
            ? "ATTRIBUTION_CURRENT"
            : "NONE";

      return {
        id: row.id,
        invoice_number: row.invoice_number ?? null,
        invoice_date: row.invoice_date ?? null,
        client_id: row.client_id ?? null,
        client_name: row.client_name ?? null,

        delegate_id: effectiveDelegateId,
        delegate_name:
          (effectiveDelegateId
            ? delegateNamesById.get(effectiveDelegateId) ?? null
            : null) ??
          clientDelegate?.delegate_name ??
          null,
        delegate_source: effectiveDelegateSource,

        recommender_id: effectiveRecommenderId,
        recommender_name:
          effectiveRecommenderId
            ? recommenderNamesById.get(effectiveRecommenderId) ?? null
            : null,
        recommender_source: effectiveRecommenderSource,

        affiliate_account_id: effectiveAffiliateId,
        affiliate_name:
          effectiveAffiliateId
            ? affiliateNamesById.get(effectiveAffiliateId) ?? null
            : null,
        affiliate_source: effectiveAffiliateSource,

        source_provider: row.source_provider ?? null,
        source_channel: row.source_channel ?? null,

        state_code: invoiceStatesById.get(String(row.id)) ?? null,
        source_month: row.source_month ?? null,
        total_net: row.total_net ?? null,
        total_gross: row.total_gross ?? null,
        currency: row.currency ?? null,
        is_paid: row.is_paid ?? null,
        paid_date: row.paid_date ?? null,

        override_meta: {
          delegate_assignment_id: delegateOverride?.id ?? null,
          recommender_assignment_id: recommenderOverride?.id ?? null,
          affiliate_assignment_id: affiliateOverride?.id ?? null,
        },
      };
    });

    return json(200, {
      ok: true,
      month,
      count: rows.length,
      rows,
      viewer: {
        actor_id: actorId,
        roles: Array.from(roles),
        unrestricted,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return json(500, {
      ok: false,
      stage,
      error: message,
    });
  }
}