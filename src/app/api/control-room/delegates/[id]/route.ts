// src/app/api/control-room/delegates/[id]/route.ts
// GET /api/control-room/delegates/[id]?month=YYYY-MM
//
// Retorna la ficha completa de un delegado:
//   - datos del actor
//   - estadísticas del periodo (facturación, unidades, comisiones)
//   - listado de facturas (emitidas en periodo + cobradas en periodo + impagadas)
//   - clientes activos e inactivos
//   - reglas de comisión vigentes
//   - propuesta de liquidación actual + historial
//   - log de auditoría

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSupervisorRole, normalizeRole } from "@/lib/auth/roles";
import { asString, asNumber, todayYmdUtc } from "@/lib/holded/holdedPrimitives";
import {
  fetchHoldedInvoiceDetail,
  computeHoldedLiveMeta,
  runWithConcurrencyLimit,
} from "@/lib/holded/holdedLiveStatus";
import type {
  DelegateDetailActor,
  DetailInvoiceRow,
  DetailClientRow,
  CommissionRule,
  SettlementProposal,
  AuditEntry,
  DetailPeriodStats,
  PaymentStatus,
} from "@/components/control-room/delegates/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
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

function getQuarterStart(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const m = Number(monthStr);
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1; // 1, 4, 7, 10
  return `${yearStr}-${String(qStartMonth).padStart(2, "0")}-01`;
}

function getYearStart(month: string): string {
  return `${month.split("-")[0]}-01-01`;
}

// Aproxima vencimiento como invoice_date + 30 días (Net30, no hay due_date en DB).
// REGLA: los CN/abonos (document_type = 'creditnote') NUNCA son OVERDUE ni PAID — son ajustes.
function inferPaymentStatus(
  isPaid: boolean | null,
  invoiceDate: string | null,
  documentType: string,
  today: string
): PaymentStatus {
  if (documentType === "creditnote") return "CREDIT_NOTE";
  if (isPaid === true) return "PAID";
  if (invoiceDate) {
    const d = new Date(invoiceDate);
    d.setDate(d.getDate() + 30);
    const approxDue = d.toISOString().slice(0, 10);
    if (today > approxDue) return "OVERDUE";
  }
  return "PENDING";
}

function computeDaysOverdue(
  isPaid: boolean | null,
  invoiceDate: string | null,
  documentType: string,
  today: string
): number | null {
  if (isPaid === true || !invoiceDate) return null;
  // Credit notes / abonos are never overdue — they are adjustments, not receivables
  if (documentType === "creditnote") return null;
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + 30);
  const approxDue = d.toISOString().slice(0, 10);
  if (today <= approxDue) return null;
  const todayMs = new Date(today).getTime();
  const dueMs = d.getTime();
  return Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000));
}

// Aplica tier de comisión (primera regla que cubre las unidades; fallback: tier mínimo).
function computeCommissionFromRules(
  units: number,
  rules: CommissionRule[]
): { percentage: number; reference_price: number; amount: number } {
  // Preferir reglas específicas del delegado sobre globales (delegate_id != null antes que null)
  const sorted = [...rules].sort((a, b) => {
    if (a.delegate_id && !b.delegate_id) return -1;
    if (!a.delegate_id && b.delegate_id) return 1;
    return a.from_units - b.from_units;
  });

  // Canal PDV por defecto
  const pdv = sorted.filter((r) => r.channel.toLowerCase() === "pdv" && r.active);
  // Fallback: tier mínimo (pdv[0]) cuando las unidades no caen en ningún tramo.
  const applicable =
    pdv.find((r) => units >= r.from_units && units <= r.to_units) ??
    pdv[0];

  if (!applicable) return { percentage: 0, reference_price: 31, amount: 0 };

  const pct = Number(applicable.percentage);
  const refPrice = Number(applicable.reference_price);
  return {
    percentage: pct,
    reference_price: refPrice,
    amount: units * refPrice * (pct / 100),
  };
}

function toActorLike(record: unknown): {
  id: string;
  role: string | null;
  name: string | null;
} | null {
  const row = record as Record<string, unknown> | null | undefined;
  const id = asString(row?.id);
  if (!id) return null;
  return {
    id,
    role: asString(row?.role),
    name: asString(row?.name),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  let stage = "auth";

  try {
    const { id: delegateId } = await ctx.params;

    // --- Auth ---
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

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) {
      return json(401, { ok: false, stage, error: "Actor not resolved" });
    }

    const role = normalizeRole(requestingActor.role);
    const isSupervisor = isSupervisorRole(role);
    const isDelegate = role === "DELEGATE";
    const isMelquisedec = role === "MELQUISEDEC";

    if (!isSupervisor && !isDelegate) {
      return json(403, { ok: false, stage, error: "Forbidden" });
    }

    // Delegados solo pueden ver su propia ficha
    if (isDelegate && requestingActor.id !== delegateId) {
      return json(403, { ok: false, stage, error: "Forbidden" });
    }

    const month = normalizeMonth(new URL(req.url).searchParams.get("month"));
    const bounds = getMonthBounds(month);
    const today = todayYmdUtc();
    const db = supabaseAdmin();

    // --- Delegate info ---
    stage = "delegate";
    const { data: actorData, error: actorError } = await db
      .from("actors")
      .select("id, role, name, email, status, commission_level, company, job_title, department, created_at")
      .eq("id", delegateId)
      .single();

    if (actorError || !actorData) {
      return json(404, { ok: false, stage, error: "Delegate not found" });
    }

    const actorRow = actorData as Record<string, unknown>;
    const delegate: DelegateDetailActor = {
      id: asString(actorRow.id) ?? delegateId,
      name: asString(actorRow.name),
      email: asString(actorRow.email),
      status: asString(actorRow.status),
      role: asString(actorRow.role),
      commission_level: asNumber(actorRow.commission_level),
      company: asString(actorRow.company),
      job_title: asString(actorRow.job_title),
      department: asString(actorRow.department),
      created_at: asString(actorRow.created_at) ?? "",
    };

    // --- Assignments → Client holded IDs ---
    stage = "assignments";
    const { data: assignmentsData, error: assignmentsError } = await db
      .from("client_actor_assignments_g1")
      .select("actor_id, client_holded_contact_id, valid_from, valid_to")
      .eq("actor_id", delegateId)
      .eq("assignment_role", "delegate")
      .is("valid_to", null);

    if (assignmentsError) {
      return json(500, { ok: false, stage, error: assignmentsError.message });
    }

    type AssRow = { actor_id: string | null; client_holded_contact_id: string | null; valid_from: string | null; valid_to: string | null };
    const assignments: AssRow[] = (Array.isArray(assignmentsData) ? assignmentsData : []).map(
      (r) => {
        const rec = r as Record<string, unknown>;
        return {
          actor_id: asString(rec.actor_id),
          client_holded_contact_id: asString(rec.client_holded_contact_id),
          valid_from: asString(rec.valid_from),
          valid_to: asString(rec.valid_to),
        };
      }
    );

    const holdedContactIds = [...new Set(
      assignments
        .map((a) => a.client_holded_contact_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    )];

    // --- Clients ---
    stage = "clients";
    type ClientDbRow = { id: string; name: string | null; holded_contact_id: string | null; created_at: string };
    let clientRows: ClientDbRow[] = [];

    if (holdedContactIds.length > 0) {
      const { data: clientsData, error: clientsError } = await db
        .from("clients")
        .select("id, name, holded_contact_id, created_at")
        .in("holded_contact_id", holdedContactIds)
        .in("state_code", ["OPEN", "ACTIVE"])
        .order("name", { ascending: true });

      if (clientsError) {
        return json(500, { ok: false, stage, error: clientsError.message });
      }

      clientRows = (Array.isArray(clientsData) ? clientsData : []).map((r) => {
        const rec = r as Record<string, unknown>;
        return {
          id: asString(rec.id) ?? "",
          name: asString(rec.name),
          holded_contact_id: asString(rec.holded_contact_id),
          created_at: asString(rec.created_at) ?? "",
        };
      }).filter((r) => r.id.length > 0);
    }

    const validFromByHoldedId = new Map<string, string | null>();
    for (const a of assignments) {
      if (a.client_holded_contact_id) {
        validFromByHoldedId.set(a.client_holded_contact_id, a.valid_from);
      }
    }

    const clientIds = clientRows.map((c) => c.id);

    // --- Invoices ---
    // Cargamos:
    //   1. Emitidas en el periodo (invoice_date en el periodo)
    //   2. Cobradas en el periodo (paid_date en el periodo, aunque sean de meses anteriores)
    //   3. Impagadas (pending/overdue, sin límite de fecha reciente)
    stage = "invoices";

    const INVOICE_SELECT =
      "id, invoice_number, invoice_date, paid_date, client_id, client_name, total_net, total_vat, total_gross, is_paid, state_code, delegate_id, document_type, external_invoice_id, source_provider";

    let allInvoices: Record<string, unknown>[] = [];

    if (clientIds.length > 0) {
      const [emittedRes, allPaidRes, unpaidRes] = await Promise.all([
        // 1. Emitidas en el periodo (para stats de "facturado este mes")
        db
          .from("invoices")
          .select(INVOICE_SELECT)
          .in("client_id", clientIds)
          .gte("invoice_date", bounds.start)
          .lt("invoice_date", bounds.endExclusive),

        // 2. TODAS las cobradas — sin restricción de periodo
        //    La UI distinguirá "cobradas en este periodo" vs "cobradas en otro periodo"
        db
          .from("invoices")
          .select(INVOICE_SELECT)
          .in("client_id", clientIds)
          .eq("is_paid", true)
          .not("paid_date", "is", null)
          .order("paid_date", { ascending: false })
          .limit(500),

        // 3. Impagadas (pending/overdue)
        db
          .from("invoices")
          .select(INVOICE_SELECT)
          .in("client_id", clientIds)
          .or("is_paid.is.null,is_paid.eq.false"),
      ]);

      if (emittedRes.error) return json(500, { ok: false, stage, error: emittedRes.error.message });
      if (allPaidRes.error) return json(500, { ok: false, stage, error: allPaidRes.error.message });
      if (unpaidRes.error) return json(500, { ok: false, stage, error: unpaidRes.error.message });

      const seen = new Set<string>();
      for (const inv of [
        ...(emittedRes.data ?? []),
        ...(allPaidRes.data ?? []),
        ...(unpaidRes.data ?? []),
      ]) {
        const rec = inv as Record<string, unknown>;
        const id = asString(rec.id) ?? "";
        if (id && !seen.has(id)) {
          seen.add(id);
          allInvoices.push(rec);
        }
      }
    }

    const invoiceIds = allInvoices.map((i) => asString(i.id)).filter((id): id is string => !!id);

    // --- Holded live-status override for unpaid invoices ---
    // The DB is the canonical store, but imports run periodically — payments made in Holded
    // between import runs show as stale "Pendiente/Vencida" here. This check fixes the display
    // in real time and auto-repairs the DB row as a side-effect.
    stage = "holded_live_status";

    // Only check invoices that look unpaid AND come from Holded (have an external_invoice_id)
    const toCheckLive = allInvoices.filter((inv) => {
      const isPaid = inv.is_paid === true;
      const isHolded = (asString(inv.source_provider) ?? "").toLowerCase() === "holded";
      const externalId = asString(inv.external_invoice_id);
      return !isPaid && isHolded && !!externalId;
    });

    // invoiceId → { isPaid, paidDate } from Holded live status
    const holdedOverrides = new Map<string, { isPaid: boolean; paidDate: string | null }>();

    if (toCheckLive.length > 0) {
      const tasks = toCheckLive.map((inv) => async () => {
        const invoiceId = asString(inv.id) ?? "";
        const externalId = asString(inv.external_invoice_id) ?? "";
        const detail = await fetchHoldedInvoiceDetail(externalId);
        if (!detail) return;
        const meta = computeHoldedLiveMeta(detail, null);
        holdedOverrides.set(invoiceId, { isPaid: meta.is_paid, paidDate: meta.paid_date });
      });

      await runWithConcurrencyLimit(tasks, 8);

      // Auto-repair: update DB rows that Holded now says are paid
      // Fire-and-forget — do not await, do not block the response
      const repairBatch: Array<{ id: string; paidDate: string | null }> = [];
      for (const [invoiceId, override] of holdedOverrides) {
        if (override.isPaid) {
          repairBatch.push({ id: invoiceId, paidDate: override.paidDate });
        }
      }
      if (repairBatch.length > 0) {
        const repairDb = supabaseAdmin();
        void Promise.all(
          repairBatch.map(({ id, paidDate }) =>
            repairDb
              .from("invoices")
              .update({
                is_paid: true,
                state_code: "SETTLED",
                paid_date: paidDate ?? todayYmdUtc(),
              })
              .eq("id", id)
          )
        );
      }
    }

    // --- Invoice items + normalizations ---
    stage = "items";
    type ItemDbRow = {
      id: string;
      invoice_id: string;
      description: string;
      units: number;
      unit_net_price: number;
      line_net_amount: number;
      vat_rate: number;
      line_vat_amount: number;
      line_gross_amount: number;
      line_type: string;
      sku: string | null;
    };

    let itemRows: ItemDbRow[] = [];
    // normalized: raw_invoice_item_id → { line_type, is_commissionable }
    const normByItemId = new Map<string, { line_type: string; is_commissionable: boolean }>();

    if (invoiceIds.length > 0) {
      const itemsRes = await db
        .from("invoice_items")
        .select(
          "id, invoice_id, description, units, unit_net_price, line_net_amount, vat_rate, line_vat_amount, line_gross_amount, line_type, sku"
        )
        .in("invoice_id", invoiceIds)
        .eq("state_code", "OPEN");

      if (itemsRes.error) return json(500, { ok: false, stage, error: itemsRes.error.message });

      itemRows = (itemsRes.data ?? []).map((r) => {
        const rec = r as Record<string, unknown>;
        return {
          id: asString(rec.id) ?? "",
          invoice_id: asString(rec.invoice_id) ?? "",
          description: asString(rec.description) ?? "",
          units: asNumber(rec.units) ?? 0,
          unit_net_price: asNumber(rec.unit_net_price) ?? 0,
          line_net_amount: asNumber(rec.line_net_amount) ?? 0,
          vat_rate: asNumber(rec.vat_rate) ?? 0,
          line_vat_amount: asNumber(rec.line_vat_amount) ?? 0,
          line_gross_amount: asNumber(rec.line_gross_amount) ?? 0,
          line_type: asString(rec.line_type) ?? "",
          sku: asString(rec.sku),
        };
      }).filter((r) => r.id.length > 0);

      // Normalizations scoped to actual item IDs — never unbounded
      const itemIds = itemRows.map((r) => r.id).filter((id) => id.length > 0);
      if (itemIds.length > 0) {
        const normRes = await db
          .from("invoice_line_normalizations")
          .select("raw_invoice_item_id, line_type, is_commissionable")
          .in("raw_invoice_item_id", itemIds)
          .eq("state_code", "OPEN");

        for (const normRec of normRes.data ?? []) {
          const rec = normRec as Record<string, unknown>;
          const rawId = asString(rec.raw_invoice_item_id);
          if (rawId) {
            normByItemId.set(rawId, {
              line_type: asString(rec.line_type) ?? "",
              is_commissionable: rec.is_commissionable === true,
            });
          }
        }
      }
    }

    // Agrupar items por invoice_id
    const itemsByInvoiceId = new Map<string, ItemDbRow[]>();
    for (const item of itemRows) {
      if (!itemsByInvoiceId.has(item.invoice_id)) {
        itemsByInvoiceId.set(item.invoice_id, []);
      }
      itemsByInvoiceId.get(item.invoice_id)!.push(item);
    }

    // Conjuntos para saber qué facturas corresponden a cada categoría
    const emittedInPeriodIds = new Set<string>();
    const paidInPeriodIds = new Set<string>();

    for (const inv of allInvoices) {
      const id = asString(inv.id) ?? "";
      const invoiceDate = asString(inv.invoice_date);
      const paidDate = asString(inv.paid_date);
      const isPaid = inv.is_paid === true;

      if (invoiceDate && invoiceDate >= bounds.start && invoiceDate < bounds.endExclusive) {
        emittedInPeriodIds.add(id);
      }
      if (isPaid && paidDate && paidDate >= bounds.start && paidDate < bounds.endExclusive) {
        paidInPeriodIds.add(id);
      }
    }

    // --- Construir filas de facturas ---
    stage = "assemble";

    const invoiceDetailRows: DetailInvoiceRow[] = allInvoices.map((inv) => {
      const id = asString(inv.id) ?? "";
      // Apply Holded live-status override when available — corrects stale DB `is_paid = false`
      const liveOverride = holdedOverrides.get(id);
      const isPaid = liveOverride ? liveOverride.isPaid : inv.is_paid === true;
      const invoiceDate = asString(inv.invoice_date);
      const paidDate = liveOverride?.paidDate ?? asString(inv.paid_date);
      const docType = (asString(inv.document_type) ?? "invoice") as "invoice" | "creditnote";
      const items = itemsByInvoiceId.get(id) ?? [];

      let unitsSold = 0;
      let unitsFoc = 0;
      let netCommissionable = 0;

      for (const item of items) {
        const norm = normByItemId.get(item.id);
        const normalizedType = (norm?.line_type ?? item.line_type ?? "").toLowerCase();
        const isCommissionable = norm?.is_commissionable ?? false;

        if (normalizedType === "sale" || normalizedType === "product") {
          unitsSold += item.units;
          if (isCommissionable) {
            netCommissionable += item.line_net_amount;
          }
        } else if (normalizedType === "promo" || normalizedType === "promotion" || normalizedType === "foc") {
          unitsFoc += item.units;
        }
      }

      const isPaidBool = isPaid ? true : (inv.is_paid as boolean | null);
      const paymentStatus = inferPaymentStatus(isPaidBool, invoiceDate, docType, today);
      const daysOverdue = computeDaysOverdue(isPaidBool, invoiceDate, docType, today);

      return {
        id,
        invoice_number: asString(inv.invoice_number) ?? "",
        invoice_date: invoiceDate,
        paid_date: paidDate,
        client_id: asString(inv.client_id),
        client_name: asString(inv.client_name),
        document_type: docType,
        units_sold: unitsSold,
        units_foc: unitsFoc,
        net_commissionable: netCommissionable,
        total_net: asNumber(inv.total_net) ?? 0,
        total_vat: asNumber(inv.total_vat) ?? 0,
        total_gross: asNumber(inv.total_gross) ?? 0,
        payment_status: paymentStatus,
        days_overdue: daysOverdue,
        paid_in_period: paidInPeriodIds.has(id),
      };
    });

    // --- Commission rules ---
    stage = "commission_rules";
    const { data: rulesData, error: rulesError } = await db
      .from("commission_rules_delegates")
      .select("id, delegate_id, year, channel, from_units, to_units, percentage, reference_price, valid_from, valid_to, active")
      .or(`delegate_id.eq.${delegateId},delegate_id.is.null`)
      .eq("active", true)
      .order("from_units", { ascending: true });

    if (rulesError) return json(500, { ok: false, stage, error: rulesError.message });

    const commissionRules: CommissionRule[] = (rulesData ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: asString(rec.id) ?? "",
        delegate_id: asString(rec.delegate_id),
        year: asNumber(rec.year) ?? 2026,
        channel: asString(rec.channel) ?? "pdv",
        from_units: asNumber(rec.from_units) ?? 0,
        to_units: asNumber(rec.to_units) ?? 0,
        percentage: asNumber(rec.percentage) ?? 0,
        reference_price: asNumber(rec.reference_price) ?? 31,
        valid_from: asString(rec.valid_from),
        valid_to: asString(rec.valid_to),
        active: rec.active === true,
      };
    });

    // --- Period stats ---
    // Facturación emitida en el periodo (solo facturas tipo invoice, no CN)
    const emittedInvoices = invoiceDetailRows.filter(
      (i) => emittedInPeriodIds.has(i.id) && i.document_type === "invoice"
    );
    // Cobradas en el periodo (solo facturas tipo invoice — CNs nunca son "cobradas")
    const paidInPeriodInvoices = invoiceDetailRows.filter(
      (i) => paidInPeriodIds.has(i.id) && i.document_type === "invoice"
    );
    // CNs emitidas en el periodo — reducen unidades e importe liquidable
    const cnInPeriod = invoiceDetailRows.filter(
      (i) => emittedInPeriodIds.has(i.id) && i.document_type === "creditnote"
    );
    // Todas las impagadas (facturas, no CN)
    const unpaidInvoices = invoiceDetailRows.filter(
      (i) => i.document_type === "invoice" && i.payment_status !== "PAID"
    );
    const pendingInvoices = unpaidInvoices.filter((i) => i.payment_status === "PENDING");
    const overdueInvoices = unpaidInvoices.filter((i) => i.payment_status === "OVERDUE");

    const billingEmittedGross = emittedInvoices.reduce((s, i) => s + i.total_gross, 0);
    const billingPaidGross = paidInPeriodInvoices.reduce((s, i) => s + i.total_gross, 0);
    const billingPendingGross = pendingInvoices.reduce((s, i) => s + i.total_gross, 0);
    const billingOverdueGross = overdueInvoices.reduce((s, i) => s + i.total_gross, 0);

    const unitsSoldPeriod = emittedInvoices.reduce((s, i) => s + i.units_sold, 0);
    const unitsFocPeriod = emittedInvoices.reduce((s, i) => s + i.units_foc, 0);

    // Neteo CN: restar unidades de CNs emitidas en el periodo de las unidades liquidables
    const cnUnitsDeduct = cnInPeriod.reduce((s, i) => s + i.units_sold, 0);
    const cnFocDeduct   = cnInPeriod.reduce((s, i) => s + i.units_foc, 0);
    const rawUnitsLiquidable = paidInPeriodInvoices.reduce((s, i) => s + i.units_sold, 0);
    const unitsLiquidable = Math.max(0, rawUnitsLiquidable - cnUnitsDeduct);

    const unitsPendingNonOverdue = pendingInvoices.reduce((s, i) => s + i.units_sold, 0);
    const unitsPendingOverdue = overdueInvoices.reduce((s, i) => s + i.units_sold, 0);

    const netCommissionableRaw = paidInPeriodInvoices.reduce((s, i) => s + i.net_commissionable, 0);
    // Si no hay normalización, aproximar por unidades netas × precio de referencia (31 €)
    const effectiveNetCommissionable = netCommissionableRaw > 0
      ? netCommissionableRaw
      : unitsLiquidable * 31;

    // Suppress unused variable warning
    void cnFocDeduct;

    const commResult = computeCommissionFromRules(Math.max(0, unitsLiquidable), commissionRules);

    // Acumulados trimestrales y anuales (desde datos ya cargados en allInvoices)
    const quarterStart = getQuarterStart(month);
    const yearStart = getYearStart(month);

    const unitsLiquidableQuarter = invoiceDetailRows
      .filter(
        (i) =>
          i.document_type === "invoice" &&
          i.paid_date &&
          i.paid_date >= quarterStart &&
          i.paid_date < bounds.endExclusive
      )
      .reduce((s, i) => s + i.units_sold, 0);

    const unitsLiquidableYear = invoiceDetailRows
      .filter(
        (i) =>
          i.document_type === "invoice" &&
          i.paid_date &&
          i.paid_date >= yearStart &&
          i.paid_date < bounds.endExclusive
      )
      .reduce((s, i) => s + i.units_sold, 0);

    const period: DetailPeriodStats = {
      month,
      billing_emitted_count: emittedInvoices.length,
      billing_emitted_gross: billingEmittedGross,
      billing_paid_count: paidInPeriodInvoices.length,
      billing_paid_gross: billingPaidGross,
      billing_pending_count: pendingInvoices.length,
      billing_pending_gross: billingPendingGross,
      billing_overdue_count: overdueInvoices.length,
      billing_overdue_gross: billingOverdueGross,
      units_sold_period: unitsSoldPeriod,
      units_foc_period: unitsFocPeriod,
      units_liquidable: unitsLiquidable,
      units_pending_non_overdue: unitsPendingNonOverdue,
      units_pending_overdue: unitsPendingOverdue,
      units_liquidable_quarter: Math.max(0, unitsLiquidableQuarter),
      units_liquidable_year: Math.max(0, unitsLiquidableYear),
      net_commissionable: effectiveNetCommissionable,
      commission_provisional: commResult.amount,
      commission_liquidable: commResult.amount,
      applied_tier_percentage: commResult.percentage > 0 ? commResult.percentage : null,
    };

    // --- Client activity segmentation ---
    // Activo = tuvo al menos una factura (no CN) emitida en el periodo
    const activeClientIds = new Set(emittedInvoices.map((i) => i.client_id).filter(Boolean));

    // Para los activos: calcular last_invoice_date, last_invoice_gross, units_period
    const clientInvoiceStats = new Map<
      string,
      { last_invoice_date: string | null; last_invoice_gross: number; units_period: number }
    >();

    for (const inv of invoiceDetailRows) {
      if (!inv.client_id) continue;
      const existing = clientInvoiceStats.get(inv.client_id);
      if (!existing) {
        clientInvoiceStats.set(inv.client_id, {
          last_invoice_date: inv.invoice_date,
          last_invoice_gross: inv.total_gross,
          units_period: inv.units_sold,
        });
      } else {
        if (
          inv.invoice_date &&
          (!existing.last_invoice_date || inv.invoice_date > existing.last_invoice_date)
        ) {
          existing.last_invoice_date = inv.invoice_date;
          existing.last_invoice_gross = inv.total_gross;
        }
        if (emittedInPeriodIds.has(inv.id)) {
          existing.units_period += inv.units_sold;
        }
      }
    }

    const activeClients: DetailClientRow[] = [];
    const inactiveClients: DetailClientRow[] = [];

    for (const client of clientRows) {
      const hid = client.holded_contact_id;
      const assignedSince = hid ? (validFromByHoldedId.get(hid) ?? null) : null;
      const stats = clientInvoiceStats.get(client.id);
      const isActive = activeClientIds.has(client.id);

      let daysSince: number | null = null;
      if (stats?.last_invoice_date) {
        const lastDate = new Date(stats.last_invoice_date);
        const todayDate = new Date(today);
        daysSince = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86_400_000);
      }

      const row: DetailClientRow = {
        id: client.id,
        name: client.name,
        last_invoice_date: stats?.last_invoice_date ?? null,
        last_invoice_gross: stats?.last_invoice_gross ?? 0,
        units_period: stats?.units_period ?? 0,
        days_since_activity: daysSince,
        assigned_since: assignedSince,
      };

      if (isActive) {
        activeClients.push(row);
      } else {
        inactiveClients.push(row);
      }
    }

    // Sort inactive by days_since_activity descending (más días sin actividad primero)
    inactiveClients.sort((a, b) => (b.days_since_activity ?? 0) - (a.days_since_activity ?? 0));

    // --- Settlement proposals ---
    stage = "settlement";
    const { data: settlementData } = await db
      .from("commission_settlement_proposals")
      .select(
        "id, period_yyyy_mm, status, total_units_sold_paid, total_units_foc, total_net_commissionable, total_commission_amount, total_adjustments_amount, total_payable_amount, data_cutoff_at, ruleset_version, created_at, updated_at"
      )
      .eq("actor_id", delegateId)
      .eq("state_code", "OPEN")
      .order("period_yyyy_mm", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);

    const settlementRows: SettlementProposal[] = (settlementData ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: asString(rec.id) ?? "",
        period_yyyy_mm: asString(rec.period_yyyy_mm) ?? "",
        status: asString(rec.status) ?? "DRAFT",
        total_units_sold_paid: asNumber(rec.total_units_sold_paid) ?? 0,
        total_units_foc: asNumber(rec.total_units_foc) ?? 0,
        total_net_commissionable: asNumber(rec.total_net_commissionable) ?? 0,
        total_commission_amount: asNumber(rec.total_commission_amount) ?? 0,
        total_adjustments_amount: asNumber(rec.total_adjustments_amount) ?? 0,
        total_payable_amount: asNumber(rec.total_payable_amount) ?? 0,
        data_cutoff_at: asString(rec.data_cutoff_at),
        ruleset_version: asString(rec.ruleset_version),
        created_at: asString(rec.created_at) ?? "",
        updated_at: asString(rec.updated_at) ?? "",
      };
    });

    const currentSettlement = settlementRows.find((s) => s.period_yyyy_mm === month) ?? null;
    const settlementHistory = settlementRows.filter((s) => s.period_yyyy_mm !== month);

    // --- Audit ---
    stage = "audit";
    const { data: auditData } = await db
      .from("audit_change_log")
      .select("id, ts, actor_id, action, table_name, row_pk, reason_code, reason_text, source")
      .eq("row_pk", delegateId)
      .order("ts", { ascending: false })
      .limit(50);

    const auditEntries: AuditEntry[] = (auditData ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: asString(rec.id) ?? "",
        ts: asString(rec.ts) ?? "",
        actor_id: asString(rec.actor_id),
        action: asString(rec.action) ?? "",
        table_name: asString(rec.table_name) ?? "",
        row_pk: asString(rec.row_pk) ?? "",
        reason_code: asString(rec.reason_code),
        reason_text: asString(rec.reason_text),
        source: asString(rec.source),
      };
    });

    // --- Respuesta ---
    return json(200, {
      ok: true,
      viewer: {
        actorId: requestingActor.id,
        isMelquisedec,
        canEdit: isMelquisedec,
      },
      delegate,
      period,
      invoices: invoiceDetailRows,
      clients: { active: activeClients, inactive: inactiveClients },
      commission_rules: commissionRules,
      settlement: { current: currentSettlement, history: settlementHistory },
      audit: auditEntries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return json(500, { ok: false, stage, error: message });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/control-room/delegates/[id]
// Solo Melquisedec puede editar datos básicos del delegado.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: delegateId } = await ctx.params;

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean;
      status?: number;
      error?: string;
      actor?: unknown;
    };

    if (!auth?.ok) {
      return json(auth?.status ?? 401, { ok: false, error: auth?.error ?? "Unauthorized" });
    }

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) return json(401, { ok: false, error: "Actor not resolved" });

    const role = normalizeRole(requestingActor.role);
    if (role !== "MELQUISEDEC") {
      return json(403, { ok: false, error: "Solo Melquisedec puede editar datos del delegado" });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json(400, { ok: false, error: "Cuerpo inválido" });

    // Campos editables (whitelist)
    const allowed: (keyof typeof body)[] = [
      "name", "email", "status", "company", "job_title", "department", "commission_level",
    ];

    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key] ?? null;
    }

    if (Object.keys(patch).length === 0) {
      return json(400, { ok: false, error: "No hay campos para actualizar" });
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("actors")
      .update(patch)
      .eq("id", delegateId)
      .select("id, role, name, email, status, commission_level, company, job_title, department, created_at")
      .single();

    if (error) return json(500, { ok: false, error: error.message });
    if (!data) return json(404, { ok: false, error: "Delegado no encontrado" });

    const rec = data as Record<string, unknown>;
    return json(200, {
      ok: true,
      delegate: {
        id: asString(rec.id) ?? delegateId,
        name: asString(rec.name),
        email: asString(rec.email),
        status: asString(rec.status),
        role: asString(rec.role),
        commission_level: asNumber(rec.commission_level),
        company: asString(rec.company),
        job_title: asString(rec.job_title),
        department: asString(rec.department),
        created_at: asString(rec.created_at) ?? "",
      },
    });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}
