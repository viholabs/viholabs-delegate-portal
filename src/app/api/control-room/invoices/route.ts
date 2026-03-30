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
  external_invoice_id: string | null;
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

type HoldedLiveStatus = {
  label: "Pagado" | "Pendiente" | "Vencido" | "Sin estado";
  due_date: string | null;
  raw_status: string | null;
  payments_total: number | null;
  payments_pending: number | null;
  total: number | null;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
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

function normalizeStateCode(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const v = value.trim();
    return v ? v : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function unixToDateYmd(unixOrString: unknown): string | null {
  if (typeof unixOrString === "number" && Number.isFinite(unixOrString)) {
    const ms = unixOrString > 9999999999 ? unixOrString : unixOrString * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof unixOrString === "string" && unixOrString.trim()) {
    const raw = unixOrString.trim();
    const n = Number(raw);
    if (Number.isFinite(n)) return unixToDateYmd(n);

    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function computeHoldedLabelFromDetail(detail: Record<string, unknown>): HoldedLiveStatus {
  const rawStatus = asString(detail["status"]);
  const total = asNumber(detail["total"]);
  const paymentsTotal = asNumber(detail["paymentsTotal"]);
  const paymentsPending = asNumber(detail["paymentsPending"]);

  const multipleDueDate = pickRecord(detail["multipledueDate"]);
  const multipleDueDateAlt = pickRecord(detail["multipleDueDate"]);

  const dueDate =
    unixToDateYmd(detail["dueDate"]) ??
    unixToDateYmd(multipleDueDate?.["date"]) ??
    unixToDateYmd(multipleDueDateAlt?.["date"]) ??
    unixToDateYmd(detail["forecastDate"]);

  const isPaid =
    (paymentsTotal ?? 0) > 0 &&
    (((paymentsPending ?? 0) <= 0) || ((paymentsTotal ?? 0) >= (total ?? 0)));

  if (isPaid) {
    return {
      label: "Pagado",
      due_date: dueDate,
      raw_status: rawStatus,
      payments_total: paymentsTotal,
      payments_pending: paymentsPending,
      total,
    };
  }

  if (dueDate && dueDate < todayYmdUtc()) {
    return {
      label: "Vencido",
      due_date: dueDate,
      raw_status: rawStatus,
      payments_total: paymentsTotal,
      payments_pending: paymentsPending,
      total,
    };
  }

  return {
    label: "Pendiente",
    due_date: dueDate,
    raw_status: rawStatus,
    payments_total: paymentsTotal,
    payments_pending: paymentsPending,
    total,
  };
}

async function fetchLiveHoldedStatusByExternalInvoiceId(
  externalInvoiceId: string
): Promise<HoldedLiveStatus> {
  const apiKey = String(process.env.HOLDED_API_KEY ?? "").trim();

  if (!apiKey) {
    return {
      label: "Sin estado",
      due_date: null,
      raw_status: null,
      payments_total: null,
      payments_pending: null,
      total: null,
    };
  }

  const url = `https://api.holded.com/api/invoicing/v1/documents/invoice/${encodeURIComponent(
    externalInvoiceId
  )}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      key: apiKey,
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      label: "Sin estado",
      due_date: null,
      raw_status: null,
      payments_total: null,
      payments_pending: null,
      total: null,
    };
  }

  const parsed = (await response.json()) as Record<string, unknown>;
  return computeHoldedLabelFromDetail(parsed);
}

async function loadActorRoles(
  supaService: any,
  actorId: string,
  baseRole: string | null
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
  actorId: string
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
  actorId: string
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
  ids: string[]
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

async function loadInvoiceStatesById(
  supaService: any,
  ids: string[]
): Promise<Map<string, InvoiceStateRow>> {
  const out = new Map<string, InvoiceStateRow>();

  if (ids.length === 0) return out;

  const { data, error } = await supaService
    .from("invoices")
    .select("id, state_code, external_invoice_id")
    .in("id", ids);

  if (error) {
    throw new Error(`invoices(state_code): ${error.message}`);
  }

  for (const row of (data ?? []) as InvoiceStateRow[]) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    out.set(id, row);
  }

  return out;
}

async function loadCurrentClientDelegatesByClientId(
  supaService: any,
  clientIds: string[]
): Promise<Map<string, ClientDelegateCurrentRow>> {
  const out = new Map<string, ClientDelegateCurrentRow>();

  if (clientIds.length === 0) return out;

  const { data, error } = await supaService
    .from("v_control_room_clients_by_delegate_current")
    .select(
      "client_id, delegate_actor_id, delegate_name, delegate_email, delegate_valid_from, delegate_source"
    )
    .in("client_id", clientIds);

  if (error) {
    throw new Error(
      `v_control_room_clients_by_delegate_current: ${error.message}`
    );
  }

  for (const row of (data ?? []) as ClientDelegateCurrentRow[]) {
    const clientId = String(row?.client_id ?? "").trim();
    if (!clientId) continue;
    out.set(clientId, row);
  }

  return out;
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
    const roles = await loadActorRoles(
      ar.supaService,
      actorId,
      ar.actor.role ?? null
    );

    const unrestricted =
      eff.isSuperAdmin || hasAnyRole(roles, ["administrative", "administrativa"]);

    const canReadInvoices =
      unrestricted ||
      hasAnyRole(roles, ["delegate", "kol"]) ||
      eff.has("control_room.invoices.read") ||
      eff.has("invoices.read") ||
      eff.has("invoices.manage");

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
      .select(
        `
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
      `
      )
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
    const [invoiceStatesById, clientDelegatesByClientId] = await Promise.all([
      loadInvoiceStatesById(ar.supaService, invoiceIds),
      loadCurrentClientDelegatesByClientId(ar.supaService, clientIds),
    ]);

    const fallbackDelegateIds = new Set<string>();
    const recommenderIds = new Set<string>();

    for (const row of invoiceRows) {
      const rawDelegateId = String(row.delegate_id ?? "").trim();
      const recommenderId = String(row.recommender_id ?? "").trim();

      if (rawDelegateId) {
        fallbackDelegateIds.add(rawDelegateId);
      }

      if (recommenderId) {
        recommenderIds.add(recommenderId);
      }
    }

    const [fallbackDelegateNamesById, recommenderNamesById] = await Promise.all([
      loadActorNamesById(ar.supaService, Array.from(fallbackDelegateIds)),
      loadActorNamesById(ar.supaService, Array.from(recommenderIds)),
    ]);

    const affiliateByInvoiceId = new Map<string, string | null>();

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

        affiliateByInvoiceId.set(
          invoiceId,
          row?.affiliate_account_id ? String(row.affiliate_account_id) : null
        );
      }
    }

    stage = "holded_live_status";
    const liveStatusByExternalInvoiceId = new Map<string, HoldedLiveStatus>();

    await Promise.all(
      invoiceRows.map(async (row) => {
        const invoiceState = invoiceStatesById.get(String(row.id ?? "").trim());
        const externalInvoiceId = String(
          invoiceState?.external_invoice_id ?? ""
        ).trim();

        if (!externalInvoiceId) return;

        const live = await fetchLiveHoldedStatusByExternalInvoiceId(
          externalInvoiceId
        );

        liveStatusByExternalInvoiceId.set(externalInvoiceId, live);
      })
    );

    const rows = invoiceRows.map((row) => {
      const clientId = String(row.client_id ?? "").trim();
      const invoiceId = String(row.id ?? "").trim();

      const clientDelegate = clientDelegatesByClientId.get(clientId);

      const canonicalDelegateId =
        String(clientDelegate?.delegate_actor_id ?? "").trim() || null;

      const rawInvoiceDelegateId =
        String(row.delegate_id ?? "").trim() || null;

      const effectiveDelegateId = canonicalDelegateId || rawInvoiceDelegateId;

      const effectiveDelegateName =
        clientDelegate?.delegate_name ??
        (rawInvoiceDelegateId
          ? fallbackDelegateNamesById.get(rawInvoiceDelegateId) ?? null
          : null);

      const effectiveRecommenderId =
        String(row.recommender_id ?? "").trim() || null;

      const invoiceState = invoiceStatesById.get(invoiceId);
      const rawStateCode = normalizeStateCode(invoiceState?.state_code ?? null);
      const externalInvoiceId = String(
        invoiceState?.external_invoice_id ?? ""
      ).trim() || null;

      const live = externalInvoiceId
        ? liveStatusByExternalInvoiceId.get(externalInvoiceId) ?? null
        : null;

      return {
        id: row.id,
        invoice_number: row.invoice_number ?? null,
        invoice_date: row.invoice_date ?? null,
        client_id: row.client_id ?? null,
        client_name: row.client_name ?? null,
        external_invoice_id: externalInvoiceId,

        delegate_id: effectiveDelegateId,
        delegate_name: effectiveDelegateName,
        delegate_email: clientDelegate?.delegate_email ?? null,
        delegate_valid_from: clientDelegate?.delegate_valid_from ?? null,
        delegate_source: clientDelegate?.delegate_source ?? null,

        recommender_id: effectiveRecommenderId,
        recommender_name:
          effectiveRecommenderId
            ? recommenderNamesById.get(effectiveRecommenderId) ?? null
            : null,

        affiliate_account_id: affiliateByInvoiceId.get(invoiceId) ?? null,

        source_provider: row.source_provider ?? null,
        source_channel: row.source_channel ?? null,

        state_code: rawStateCode,
        holded_status_label: live?.label ?? "Sin estado",
        due_date: live?.due_date ?? null,

        is_paid: row.is_paid ?? null,
        paid_date: row.paid_date ?? null,

        source_month: row.source_month ?? null,
        total_net: row.total_net ?? null,
        total_gross: row.total_gross ?? null,
        currency: row.currency ?? null,
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