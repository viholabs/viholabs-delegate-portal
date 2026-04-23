import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSupervisorRole, normalizeRole } from "@/lib/auth/roles";
import {
  asString,
  asNumber,
  todayYmdUtc,
} from "@/lib/holded/holdedPrimitives";
import {
  fetchHoldedInvoiceDetail,
  computeHoldedLiveMeta,
  runWithConcurrencyLimit,
  type HoldedLiveStatusLabel,
} from "@/lib/holded/holdedLiveStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DelegateListRow = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  clients_total: number;
  clients_active: number;
  clients_dormant: number;
  period: {
    month: string;
    emitted_count: number;
    emitted_total_net: number;
    emitted_total_gross: number;
    liquidable_count: number;
    liquidable_total_net: number;
    liquidable_total_gross: number;
    pending_count: number;
    pending_total_gross: number;
    overdue_count: number;
    overdue_total_gross: number;
    commission_provisional: number;
    applied_tier_pct: number | null;
    units_approx: number;
    next_tier_pct: number | null;
    next_tier_threshold: number | null;
  };
};

type ActorLike = {
  id: string;
  role: string | null;
  name: string | null;
  email: string | null;
  status: string | null;
};

type ClientRow = {
  id: string;
  holded_contact_id: string | null;
};

type AssignmentRow = {
  actor_id: string | null;
  client_holded_contact_id: string | null;
  valid_to: string | null;
};

type InvoiceRow = {
  id: string;
  client_id: string | null;
  invoice_date: string | null;
  paid_date: string | null;
  total_net: number | null;
  total_gross: number | null;
  is_paid: boolean | null;
  state_code: string | null;
  document_type: string | null;
  external_invoice_id: string | null;
  source_provider: string | null;
};


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function toActorLike(record: unknown): ActorLike | null {
  const row = record as Record<string, unknown> | null | undefined;
  const id = asString(row?.id);
  if (!id) return null;
  return {
    id,
    role: asString(row?.role),
    name: asString(row?.name),
    email: asString(row?.email),
    status: asString(row?.status),
  };
}

function normalizeMonth(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 7);
}

function getMonthBounds(month: string): { start: string; endExclusive: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: end.toISOString().slice(0, 10),
  };
}

function isDelegateRole(role: string): boolean {
  return role === "DELEGATE";
}

function fallbackInvoiceLabel(invoice: InvoiceRow): HoldedLiveStatusLabel {
  if (invoice.is_paid === true) return "Pagado";

  const today = todayYmdUtc();
  if (invoice.invoice_date && invoice.invoice_date < today) return "Vencido";

  return invoice.is_paid === false ? "Pendiente" : "Sin estado";
}

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

type SupabaseAdmin = ReturnType<typeof supabaseAdmin>;

async function readDelegates(
  db: SupabaseAdmin,
  actor: ActorLike
): Promise<ActorLike[]> {
  const role = normalizeRole(actor.role);

  if (isDelegateRole(role)) {
    return [actor];
  }

  const { data, error } = await db
    .from("actors")
    .select("id, role, name, email, status")
    .eq("role", "delegate")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => toActorLike(row))
    .filter((row): row is ActorLike => row !== null);
}

async function readActiveDelegateAssignments(
  db: SupabaseAdmin,
  delegateIds: string[]
): Promise<AssignmentRow[]> {
  if (delegateIds.length === 0) return [];

  const { data, error } = await db
    .from("client_actor_assignments_g1")
    .select("actor_id, client_holded_contact_id, valid_to")
    .eq("assignment_role", "delegate")
    .in("actor_id", delegateIds);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        actor_id: asString(record.actor_id),
        client_holded_contact_id: asString(record.client_holded_contact_id),
        valid_to: asString(record.valid_to),
      };
    })
    .filter((row) => !row.valid_to);
}

async function readClientsByHoldedContactIds(
  db: SupabaseAdmin,
  holdedContactIds: string[]
): Promise<ClientRow[]> {
  if (holdedContactIds.length === 0) return [];

  const { data, error } = await db
    .from("clients")
    .select("id, holded_contact_id")
    .in("holded_contact_id", holdedContactIds);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: asString(record.id) ?? "",
        holded_contact_id: asString(record.holded_contact_id),
      };
    })
    .filter((row) => row.id.length > 0);
}

async function readInvoicesForClientsInMonth(
  db: SupabaseAdmin,
  clientIds: string[],
  month: string
): Promise<InvoiceRow[]> {
  if (clientIds.length === 0) return [];

  const bounds = getMonthBounds(month);

  const { data, error } = await db
    .from("invoices")
    .select(
      "id, client_id, invoice_date, paid_date, total_net, total_gross, is_paid, state_code, document_type, external_invoice_id, source_provider"
    )
    .in("client_id", clientIds)
    .gte("invoice_date", bounds.start)
    .lt("invoice_date", bounds.endExclusive);

  if (error) throw new Error(error.message);

  return mapInvoiceRows(data);
}

/**
 * Loads only UNPAID invoices for pending/overdue calculations.
 *
 * Performance fix: the original loaded ALL invoices across all time,
 * which would OOM at scale. Paid invoices are already counted in the
 * monthly stats — we only need unpaid ones here.
 */
async function readUnpaidInvoicesForClients(
  db: SupabaseAdmin,
  clientIds: string[]
): Promise<InvoiceRow[]> {
  if (clientIds.length === 0) return [];

  const { data, error } = await db
    .from("invoices")
    .select(
      "id, client_id, invoice_date, paid_date, total_net, total_gross, is_paid, state_code, document_type, external_invoice_id, source_provider"
    )
    .in("client_id", clientIds)
    .eq("document_type", "invoice") // exclude credit notes — they have negative gross and should never appear as overdue/pending
    .not("is_paid", "eq", true);

  if (error) throw new Error(error.message);

  return mapInvoiceRows(data);
}

function mapInvoiceRows(data: unknown): InvoiceRow[] {
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: asString(record.id) ?? "",
        client_id: asString(record.client_id),
        invoice_date: asString(record.invoice_date),
        paid_date: asString(record.paid_date),
        total_net: asNumber(record.total_net),
        total_gross: asNumber(record.total_gross),
        is_paid: typeof record.is_paid === "boolean" ? record.is_paid : null,
        state_code: asString(record.state_code),
        document_type: asString(record.document_type),
        external_invoice_id: asString(record.external_invoice_id),
        source_provider: asString(record.source_provider),
      };
    })
    .filter((row) => row.id.length > 0);
}

/**
 * Invoices effectively paid (is_paid=true) with paid_date falling within the month.
 * These are the basis for liquidable count and commission — regardless of emission date.
 * Excludes credit notes (document_type != 'invoice' is not in schema, so we rely on caller).
 */
async function readPaidInMonthInvoices(
  db: SupabaseAdmin,
  clientIds: string[],
  month: string
): Promise<InvoiceRow[]> {
  if (clientIds.length === 0) return [];
  const bounds = getMonthBounds(month);
  const { data, error } = await db
    .from("invoices")
    .select(
      "id, client_id, invoice_date, paid_date, total_net, total_gross, is_paid, state_code, external_invoice_id, source_provider"
    )
    .in("client_id", clientIds)
    .eq("is_paid", true)
    .eq("document_type", "invoice")
    .gte("paid_date", bounds.start)
    .lt("paid_date", bounds.endExclusive)
    .not("paid_date", "is", null);

  if (error) throw new Error(error.message);
  return mapInvoiceRows(data);
}

/**
 * Returns sale-type item units per invoice_id for a set of invoice IDs.
 * Used to compute actual comissionable units instead of total_net/31 approximation.
 */
async function readSaleUnitsByInvoiceId(
  db: SupabaseAdmin,
  invoiceIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (invoiceIds.length === 0) return result;

  const { data, error } = await db
    .from("invoice_items")
    .select("invoice_id, line_type, units")
    .in("invoice_id", invoiceIds)
    .eq("state_code", "OPEN");

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const rec = row as Record<string, unknown>;
    const invoiceId = asString(rec.invoice_id);
    const lineType = (asString(rec.line_type) ?? "").toLowerCase();
    const units = asNumber(rec.units) ?? 0;
    if (!invoiceId) continue;
    // Only sale-type lines are commissionable
    if (lineType === "sale" || lineType === "product") {
      result.set(invoiceId, (result.get(invoiceId) ?? 0) + units);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Live label resolution — concurrency-capped
// ---------------------------------------------------------------------------

/**
 * Resolves Holded live payment labels for a set of invoices.
 *
 * Performance fix: original used Promise.all() with no limit, which could
 * fire thousands of simultaneous requests to Holded. Now capped at 8
 * concurrent requests via runWithConcurrencyLimit().
 */
async function resolveInvoiceLabels(
  invoices: InvoiceRow[]
): Promise<Map<string, HoldedLiveStatusLabel>> {
  const labelsByInvoiceId = new Map<string, HoldedLiveStatusLabel>();
  const liveStatusCache = new Map<string, HoldedLiveStatusLabel>();

  // Build task list: one per unique Holded external ID
  const tasks = invoices.map((invoice) => async () => {
    const invoiceId = invoice.id;
    const externalInvoiceId = String(invoice.external_invoice_id ?? "").trim();
    const isHolded =
      String(invoice.source_provider ?? "").trim().toLowerCase() === "holded";

    if (isHolded && externalInvoiceId) {
      if (!liveStatusCache.has(externalInvoiceId)) {
        const detail = await fetchHoldedInvoiceDetail(externalInvoiceId);
        const label: HoldedLiveStatusLabel = detail
          ? computeHoldedLiveMeta(detail, null).holded_status_label
          : fallbackInvoiceLabel(invoice);
        liveStatusCache.set(externalInvoiceId, label);
      }
      labelsByInvoiceId.set(
        invoiceId,
        liveStatusCache.get(externalInvoiceId) ?? fallbackInvoiceLabel(invoice)
      );
      return;
    }

    labelsByInvoiceId.set(invoiceId, fallbackInvoiceLabel(invoice));
  });

  await runWithConcurrencyLimit(tasks, 8);

  return labelsByInvoiceId;
}

// ---------------------------------------------------------------------------
// Row assembly
// ---------------------------------------------------------------------------

type RuleRecord = Record<string, unknown>;

/** Returns the first tier whose from_units > currentUnits (i.e. the next step up). */
function getNextTier(
  currentUnits: number,
  delegateId: string,
  rules: RuleRecord[]
): { threshold: number; pct: number } | null {
  const pdv = rules
    .filter((r) => (asString(r.channel) ?? "").toLowerCase() === "pdv")
    .filter((r) => !r.delegate_id || asString(r.delegate_id) === delegateId)
    .sort((a, b) => {
      if (a.delegate_id && !b.delegate_id) return -1;
      if (!a.delegate_id && b.delegate_id) return 1;
      return (asNumber(a.from_units) ?? 0) - (asNumber(b.from_units) ?? 0);
    });

  const next = pdv.find((r) => (asNumber(r.from_units) ?? 0) > currentUnits);
  if (!next) return null;
  return { threshold: asNumber(next.from_units) ?? 0, pct: asNumber(next.percentage) ?? 0 };
}

function applyCommissionTier(
  unitsApprox: number,
  delegateId: string,
  rules: RuleRecord[]
): { pct: number; commission: number } {
  const pdv = rules
    .filter((r) => (asString(r.channel) ?? "").toLowerCase() === "pdv")
    .sort((a, b) => {
      // Delegate-specific rules first, then global, then by from_units
      if (a.delegate_id && !b.delegate_id) return -1;
      if (!a.delegate_id && b.delegate_id) return 1;
      return (asNumber(a.from_units) ?? 0) - (asNumber(b.from_units) ?? 0);
    })
    .filter(
      (r) => !r.delegate_id || asString(r.delegate_id) === delegateId
    );

  const applicable =
    pdv.find(
      (r) =>
        unitsApprox >= (asNumber(r.from_units) ?? 0) &&
        unitsApprox <= (asNumber(r.to_units) ?? 0)
    ) ?? pdv[0] ?? null;

  if (!applicable) return { pct: 0, commission: 0 };
  const pct = asNumber(applicable.percentage) ?? 0;
  const refPrice = asNumber(applicable.reference_price) ?? 31;
  return { pct, commission: unitsApprox * refPrice * (pct / 100) };
}

function buildDelegateRows(args: {
  delegates: ActorLike[];
  assignments: AssignmentRow[];
  clients: ClientRow[];
  monthInvoices: InvoiceRow[];
  paidMonthInvoices: InvoiceRow[];
  unpaidInvoices: InvoiceRow[];
  labelsByInvoiceId: Map<string, HoldedLiveStatusLabel>;
  saleUnitsByInvoiceId: Map<string, number>;
  allRules: RuleRecord[];
  lastInvoiceDateByClientId: Map<string, string>;
  month: string;
}): DelegateListRow[] {
  const {
    delegates,
    assignments,
    clients,
    monthInvoices,
    paidMonthInvoices,
    unpaidInvoices,
    labelsByInvoiceId,
    saleUnitsByInvoiceId,
    allRules,
    lastInvoiceDateByClientId,
    month,
  } = args;

  const dormantCutoff = new Date(new Date().getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const holdedToClientId = new Map<string, string>();
  for (const client of clients) {
    if (client.holded_contact_id) {
      holdedToClientId.set(client.holded_contact_id, client.id);
    }
  }

  const delegateToClientIds = new Map<string, Set<string>>();
  for (const delegate of delegates) {
    delegateToClientIds.set(delegate.id, new Set<string>());
  }

  for (const assignment of assignments) {
    if (!assignment.actor_id || !assignment.client_holded_contact_id) continue;
    const clientId = holdedToClientId.get(assignment.client_holded_contact_id);
    if (!clientId) continue;
    if (!delegateToClientIds.has(assignment.actor_id)) {
      delegateToClientIds.set(assignment.actor_id, new Set<string>());
    }
    delegateToClientIds.get(assignment.actor_id)!.add(clientId);
  }

  const monthInvoicesByClientId = new Map<string, InvoiceRow[]>();
  for (const invoice of monthInvoices) {
    if (!invoice.client_id) continue;
    if (!monthInvoicesByClientId.has(invoice.client_id)) {
      monthInvoicesByClientId.set(invoice.client_id, []);
    }
    monthInvoicesByClientId.get(invoice.client_id)!.push(invoice);
  }

  // Liquidable = invoices with paid_date in month (regardless of emission date)
  const paidMonthByClientId = new Map<string, InvoiceRow[]>();
  for (const invoice of paidMonthInvoices) {
    if (!invoice.client_id) continue;
    if (!paidMonthByClientId.has(invoice.client_id)) {
      paidMonthByClientId.set(invoice.client_id, []);
    }
    paidMonthByClientId.get(invoice.client_id)!.push(invoice);
  }

  const unpaidByClientId = new Map<string, InvoiceRow[]>();
  for (const invoice of unpaidInvoices) {
    if (!invoice.client_id) continue;
    if (!unpaidByClientId.has(invoice.client_id)) {
      unpaidByClientId.set(invoice.client_id, []);
    }
    unpaidByClientId.get(invoice.client_id)!.push(invoice);
  }

  return delegates.map((delegate) => {
    const clientIds = delegateToClientIds.get(delegate.id) ?? new Set<string>();
    const delegateMonthInvoices: InvoiceRow[] = [];
    const delegatePaidMonthInvoices: InvoiceRow[] = [];
    const delegateUnpaidInvoices: InvoiceRow[] = [];

    for (const clientId of clientIds) {
      delegateMonthInvoices.push(...(monthInvoicesByClientId.get(clientId) ?? []));
      delegatePaidMonthInvoices.push(...(paidMonthByClientId.get(clientId) ?? []));
      delegateUnpaidInvoices.push(...(unpaidByClientId.get(clientId) ?? []));
    }

    // Emitted in month (by invoice_date)
    let emittedCount = 0;
    let emittedTotalNet = 0;
    let emittedTotalGross = 0;
    for (const invoice of delegateMonthInvoices) {
      emittedCount += 1;
      emittedTotalNet += invoice.total_net ?? 0;
      emittedTotalGross += invoice.total_gross ?? 0;
    }

    // Liquidable = paid_date in month — base for commission
    let liquidableCount = 0;
    let liquidableTotalGross = 0;
    let unitsLiquidable = 0;
    for (const invoice of delegatePaidMonthInvoices) {
      liquidableCount += 1;
      liquidableTotalGross += invoice.total_gross ?? 0;
      unitsLiquidable += saleUnitsByInvoiceId.get(invoice.id) ?? 0;
    }

    // Pending / overdue (unpaid invoices)
    let pendingCount = 0;
    let pendingTotalGross = 0;
    let overdueCount = 0;
    let overdueTotalGross = 0;
    for (const invoice of delegateUnpaidInvoices) {
      const totalGross = invoice.total_gross ?? 0;
      const label = labelsByInvoiceId.get(invoice.id) ?? fallbackInvoiceLabel(invoice);
      if (label === "Pendiente") {
        pendingCount += 1;
        pendingTotalGross += totalGross;
      }
      if (label === "Vencido") {
        overdueCount += 1;
        overdueTotalGross += totalGross;
      }
    }

    // Commission from actual units (not approximation)
    const { pct: appliedTierPct, commission: commissionProvisional } =
      applyCommissionTier(unitsLiquidable, delegate.id, allRules);

    const nextTier = getNextTier(unitsLiquidable, delegate.id, allRules);

    // Active = purchase in the last 30 days; dormant = no purchase in last 30 days
    let clientsActive = 0;
    let clientsDormant = 0;
    for (const cid of clientIds) {
      const lastDate = lastInvoiceDateByClientId.get(cid);
      if (lastDate && lastDate >= dormantCutoff) {
        clientsActive += 1;
      } else {
        clientsDormant += 1;
      }
    }

    return {
      id: delegate.id,
      name: delegate.name,
      email: delegate.email,
      status: delegate.status,
      clients_total: clientIds.size,
      clients_active: clientsActive,
      clients_dormant: clientsDormant,
      period: {
        month,
        emitted_count: emittedCount,
        emitted_total_net: emittedTotalNet,
        emitted_total_gross: emittedTotalGross,
        liquidable_count: liquidableCount,
        liquidable_total_net: liquidableTotalGross, // gross used as proxy; net unavailable here
        liquidable_total_gross: liquidableTotalGross,
        pending_count: pendingCount,
        pending_total_gross: pendingTotalGross,
        overdue_count: overdueCount,
        overdue_total_gross: overdueTotalGross,
        commission_provisional: commissionProvisional,
        applied_tier_pct: appliedTierPct > 0 ? appliedTierPct : null,
        units_approx: unitsLiquidable,
        next_tier_pct: nextTier?.pct ?? null,
        next_tier_threshold: nextTier?.threshold ?? null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handle(req: Request) {
  let stage = "auth";

  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieNames = cookieHeader.split(";").map(p => p.trim().split("=")[0]).filter(Boolean);
  console.log("[DELEGATES] x-viholabs-token:", req.headers.get("x-viholabs-token") ?? "null");
  console.log("[DELEGATES] cookies:", cookieNames.join(", ") || "none");

  try {
    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean;
      status?: number;
      error?: string;
      actor?: unknown;
    };

    if (!auth?.ok) {
      return json(auth?.status ?? 401, {
        ok: false,
        stage,
        error: auth?.error ?? "Unauthorized",
      });
    }

    const actor = toActorLike(auth.actor);
    if (!actor) {
      return json(401, { ok: false, stage, error: "Actor not resolved" });
    }

    const role = normalizeRole(actor.role);

    if (!isSupervisorRole(role) && !isDelegateRole(role)) {
      return json(403, { ok: false, stage, error: "Forbidden" });
    }

    stage = "input";
    let month = normalizeMonth(new URL(req.url).searchParams.get("month"));

    if (req.method === "POST") {
      try {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        month = normalizeMonth(body?.month ?? month);
      } catch {
        // keep default month
      }
    }

    const db = supabaseAdmin();

    stage = "delegates";
    const allDelegates = await readDelegates(db, actor);
    const allDelegateIds = allDelegates.map((d) => d.id);

    // For supervisors: filter to operational delegates only.
    // Operational = has at least one active client assignment OR at least one invoice.
    // This excludes test/inactive delegates from every dropdown that uses this endpoint.
    stage = "assignments";
    const [assignments, invoiceDelegatesResult] = await Promise.all([
      readActiveDelegateAssignments(db, allDelegateIds),
      isDelegateRole(role)
        ? Promise.resolve({ data: null, error: null })
        : db
            .from("invoices")
            .select("delegate_id")
            .in("delegate_id", allDelegateIds)
            .not("delegate_id", "is", null),
    ]);

    const operationalIds = new Set<string>(
      assignments.map((a) => a.actor_id).filter((id): id is string => !!id)
    );
    if (Array.isArray(invoiceDelegatesResult.data)) {
      for (const row of invoiceDelegatesResult.data) {
        const id = asString((row as Record<string, unknown>).delegate_id);
        if (id) operationalIds.add(id);
      }
    }

    // Safety valve: if no operational delegates found (e.g. fresh install), keep all
    const delegates = operationalIds.size > 0
      ? allDelegates.filter((d) => operationalIds.has(d.id))
      : allDelegates;
    const delegateIds = delegates.map((d) => d.id);

    const holdedContactIds = Array.from(
      new Set(
        assignments
          .map((a) => a.client_holded_contact_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );

    stage = "clients";
    const clients = await readClientsByHoldedContactIds(db, holdedContactIds);
    const clientIds = clients.map((c) => c.id);

    stage = "month_invoices";
    const [monthInvoices, paidMonthInvoices, unpaidInvoices] = await Promise.all([
      readInvoicesForClientsInMonth(db, clientIds, month),
      readPaidInMonthInvoices(db, clientIds, month),
      readUnpaidInvoicesForClients(db, clientIds),
    ]);

    stage = "labels";
    // Resolve labels for month-emitted + unpaid invoices (for pending/overdue distinction).
    // paidMonthInvoices are already confirmed paid via DB — no Holded lookup needed for them.
    const allInvoicesToLabel = [
      ...monthInvoices,
      ...unpaidInvoices.filter(
        (inv) => !monthInvoices.some((m) => m.id === inv.id)
      ),
    ];
    const labelsByInvoiceId = await resolveInvoiceLabels(allInvoicesToLabel);

    stage = "invoice_items";
    const paidMonthInvoiceIds = paidMonthInvoices.map((i) => i.id);
    const saleUnitsByInvoiceId = await readSaleUnitsByInvoiceId(db, paidMonthInvoiceIds);

    stage = "commission_rules";
    const { data: rulesData } = await db
      .from("commission_rules_delegates")
      .select("delegate_id, channel, from_units, to_units, percentage, reference_price")
      .eq("active", true)
      .order("from_units", { ascending: true });

    const allRules = (rulesData ?? []) as Array<Record<string, unknown>>;

    stage = "client_activity";
    // Last invoice date per client — used to detect dormant clients (>30 days without activity)
    const lastInvoiceDateByClientId = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: activityData } = await db
        .from("invoices")
        .select("client_id, invoice_date")
        .in("client_id", clientIds)
        .eq("document_type", "invoice")
        .order("invoice_date", { ascending: false });

      for (const row of activityData ?? []) {
        const rec = row as Record<string, unknown>;
        const cid = asString(rec.client_id);
        const d = asString(rec.invoice_date);
        if (cid && d && !lastInvoiceDateByClientId.has(cid)) {
          lastInvoiceDateByClientId.set(cid, d);
        }
      }
    }

    stage = "assemble";
    const delegateRows = buildDelegateRows({
      delegates,
      assignments,
      clients,
      monthInvoices,
      paidMonthInvoices,
      unpaidInvoices,
      labelsByInvoiceId,
      saleUnitsByInvoiceId,
      allRules,
      lastInvoiceDateByClientId,
      month,
    });

    return json(200, {
      ok: true,
      stage: "ok",
      actor: {
        id: actor.id,
        role: actor.role,
        name: actor.name,
      },
      period: { month },
      delegates: delegateRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return json(500, { ok: false, stage, error: message });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
