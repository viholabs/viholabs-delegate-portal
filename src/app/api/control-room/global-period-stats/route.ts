import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getMonthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(y, m - 1, 1));
  const endDate = new Date(Date.UTC(y, m, 1));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

function getMadridToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function normalizeMonth(input: unknown): string {
  const s = String(input ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function diffDays(dateA: string, dateB: string): number {
  return Math.floor(
    (new Date(`${dateA}T00:00:00Z`).getTime() - new Date(`${dateB}T00:00:00Z`).getTime()) / 86400000
  );
}

// ---------------------------------------------------------------------------
// CN-annulled invoice detection
//
// Holded marks the original invoice as SETTLED when a CN is issued, setting
// paid_date to the sync date (not the actual CN compensation date). This causes
// CN-cancelled invoices to appear as "cobradas" in the wrong period.
//
// Detection rule (no explicit DB link exists — the Holded `from` field is
// present in raw_summary_keys but its value was never persisted):
//   - Same holded_contact_id
//   - CN.total_net + invoice.total_net ≈ 0  (exact centimes match)
//   - CN.invoice_date >= invoice.invoice_date  (CN cannot predate the invoice)
//
// CN-annulled invoices are excluded from emitidas/cobradas/pendientes/vencidas
// and reported as a separate "anuladas" category.
// ---------------------------------------------------------------------------
function buildAnnulledSet(allRows: any[]): Set<string> {
  const creditNotes = allRows.filter(
    (r) => r.document_type === "creditnote" || r.document_type === "credit_note"
  );

  // key: "holded_contact_id|abs_centimes"
  const cnIndex = new Map<string, any[]>();
  for (const cn of creditNotes) {
    if (!cn.holded_contact_id || cn.total_net == null) continue;
    const key = `${cn.holded_contact_id}|${Math.round(Math.abs(toNum(cn.total_net)) * 100)}`;
    if (!cnIndex.has(key)) cnIndex.set(key, []);
    cnIndex.get(key)!.push(cn);
  }

  const annulled = new Set<string>();
  const usedCnIds = new Set<string>(); // prevent one CN from annulling two invoices

  const regular = allRows.filter(
    (r) => r.document_type !== "creditnote" && r.document_type !== "credit_note"
  );

  for (const inv of regular) {
    if (!inv.holded_contact_id || inv.total_net == null) continue;
    const key = `${inv.holded_contact_id}|${Math.round(Math.abs(toNum(inv.total_net)) * 100)}`;
    const candidates = cnIndex.get(key);
    if (!candidates) continue;

    const match = candidates.find(
      (cn) =>
        !usedCnIds.has(cn.id) &&
        (!inv.invoice_date || !cn.invoice_date || cn.invoice_date >= inv.invoice_date)
    );

    if (match) {
      annulled.add(inv.id);
      usedCnIds.add(match.id);
    }
  }

  return annulled;
}

export async function GET(request: NextRequest) {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = normalizeMonth(monthParam);
  const { start, end } = getMonthBounds(month);
  const today = getMadridToday();

  const ctx = await resolveDashboardContext(request);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal && !ctx.permissions.canViewFinance) {
    return json(403, { ok: false, error: "Acceso restringido" });
  }

  const supa = ctx.supaService;

  // Load all invoices relevant to this period plus all unpaid ones.
  // Include holded_contact_id for CN-invoice matching.
  const { data: rows, error } = await supa
    .from("invoices")
    .select("id, invoice_date, paid_date, is_paid, total_net, document_type, holded_contact_id")
    .or(`invoice_date.gte.${start},paid_date.gte.${start},is_paid.is.false,is_paid.is.null`)
    .limit(10000);

  if (error) return json(500, { ok: false, error: error.message });

  const allRows: any[] = Array.isArray(rows) ? rows : [];

  // Detect CN-annulled invoices before any other classification
  const annulledIds = buildAnnulledSet(allRows);

  const regular = allRows.filter(
    (r) => r.document_type !== "creditnote" && r.document_type !== "credit_note"
  );

  // Emitidas en el periodo — excluding CN-annulled
  const emitted = regular.filter(
    (r) => r.invoice_date >= start && r.invoice_date < end && !annulledIds.has(r.id)
  );

  // Cobradas en el periodo — excluding CN-annulled
  const paid = regular.filter(
    (r) =>
      r.paid_date &&
      r.paid_date >= start &&
      r.paid_date < end &&
      r.is_paid === true &&
      !annulledIds.has(r.id)
  );

  // Impagadas activas (no CN-annulled)
  const unpaid = regular.filter((r) => !r.is_paid && r.invoice_date && !annulledIds.has(r.id));

  // Pendientes: Net30 no superado
  const pending = unpaid.filter((r) => diffDays(today, r.invoice_date) <= 30);

  // Vencidas: Net30 superado
  const overdue = unpaid.filter((r) => diffDays(today, r.invoice_date) > 30);

  // Anuladas: regular invoices emitted in period that have a matching CN
  const voided = regular.filter(
    (r) => r.invoice_date >= start && r.invoice_date < end && annulledIds.has(r.id)
  );

  function sum(arr: any[]): number {
    return Number(arr.reduce((s, r) => s + toNum(r.total_net, 0), 0).toFixed(2));
  }

  // Units sold: sale lines from invoice_items for non-annulled invoices emitted in period
  const emittedIds = emitted.map((r) => r.id);
  let units_sold = 0;
  if (emittedIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supa
      .from("invoice_items")
      .select("units, line_type")
      .in("invoice_id", emittedIds)
      .eq("line_type", "sale");
    if (!itemsError && Array.isArray(itemRows)) {
      units_sold = itemRows.reduce((acc, r) => acc + toNum(r.units, 0), 0);
    }
  }

  return json(200, {
    ok: true,
    month,
    units_sold,
    emitted: { count: emitted.length, amount: sum(emitted) },
    paid: { count: paid.length, amount: sum(paid) },
    pending: { count: pending.length, amount: sum(pending) },
    overdue: { count: overdue.length, amount: sum(overdue) },
    voided: { count: voided.length, amount: sum(voided) },
  });
}
