/**
 * POST /api/holded/invoices/reconcile-open
 *
 * Re-verifica en Holded todas las facturas OPEN de la BD contra la API de Holded.
 * Detecta facturas saldadas que el sync incremental no actualiza porque Holded
 * no las marca como "modificadas" al:
 *   a) Registrar un cobro via banco/giro/remesa (paymentsTotal no se actualiza en el API detalle)
 *   b) Crear una CN que anula la factura (estado "anulado" solo en el API de lista)
 *
 * Estrategia:
 *   1. Llama a la API de LISTA de Holded para obtener el estado real (paid/anulado/pending)
 *   2. Llama a la API de DETALLE para obtener paid_date si está disponible
 *   3. Actualiza la BD en consecuencia
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";
import { holdedListDocuments } from "@/lib/holded/holdedClient";

export const runtime = "nodejs";
export const maxDuration = 60;

const HOLDED_API_BASE = "https://api.holded.com/api/invoicing/v1";
const EPSILON = 0.02;

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function unixToDateYmd(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 9_999_999_999 ? v : v * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return unixToDateYmd(n);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

function extractDueDate(detail: Record<string, unknown>): string | null {
  const multi = typeof detail["multipledueDate"] === "object" && detail["multipledueDate"] !== null
    ? (detail["multipledueDate"] as Record<string, unknown>) : null;
  const multiAlt = typeof detail["multipleDueDate"] === "object" && detail["multipleDueDate"] !== null
    ? (detail["multipleDueDate"] as Record<string, unknown>) : null;
  return (
    unixToDateYmd(detail["dueDate"]) ??
    unixToDateYmd(multi?.["date"]) ??
    unixToDateYmd(multiAlt?.["date"]) ??
    unixToDateYmd(detail["forecastDate"]) ??
    null
  );
}

/** Normalise Holded status — handles both string ("anulado") and integer (5) codes */
function resolveHoldedListStatus(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim().toLowerCase();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const map: Record<number, string> = { 0: "draft", 1: "pending", 2: "paid", 3: "pending", 4: "overdue", 5: "anulado" };
    return map[raw] ?? String(raw);
  }
  return null;
}

function isStatusPaid(s: string | null): boolean {
  if (!s) return false;
  return ["paid", "pagado", "cobrado", "closed", "settled", "collected"].includes(s);
}

function isStatusCancelled(s: string | null): boolean {
  if (!s) return false;
  return ["anulado", "anulada", "cancelled", "canceled", "void", "voided"].includes(s);
}

async function fetchHoldedDetail(externalId: string): Promise<Record<string, unknown> | null> {
  const apiKey = (process.env.HOLDED_API_KEY ?? "").trim();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${HOLDED_API_BASE}/documents/invoice/${encodeURIComponent(externalId)}`,
      { headers: { key: apiKey, accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (typeof data === "object" && data !== null && !Array.isArray(data))
      ? (data as Record<string, unknown>) : null;
  } catch { return null; }
}

function extractPaidFromDetail(detail: Record<string, unknown>, totalGross: number): {
  isPaid: boolean; paidDate: string | null; paymentsTotal: number | null; paymentsPending: number | null;
} {
  const paymentsTotal = asNumber(detail["paymentsTotal"]) ?? asNumber(detail["payments_total"]);
  const paymentsPending = asNumber(detail["paymentsPending"]) ?? asNumber(detail["payments_pending"]);
  const holdedTotal = asNumber(detail["total"]) ?? totalGross;

  const statusRaw = typeof detail["status"] === "string" ? detail["status"].toLowerCase()
    : typeof detail["docStatus"] === "string" ? (detail["docStatus"] as string).toLowerCase() : "";
  const explicitPaid = isStatusPaid(statusRaw);

  const isPaid = explicitPaid
    || (paymentsPending !== null && paymentsPending <= EPSILON)
    || (paymentsTotal !== null && paymentsTotal >= holdedTotal - EPSILON);

  let paidDate: string | null = null;
  const paymentsDetail = Array.isArray(detail["paymentsDetail"]) ? detail["paymentsDetail"] as any[] : [];
  for (const p of paymentsDetail) {
    const d = unixToDateYmd(p?.date) ?? unixToDateYmd(p?.paidAt) ?? unixToDateYmd(p?.createdAt);
    if (d && (!paidDate || d > paidDate)) paidDate = d;
  }

  return { isPaid, paidDate, paymentsTotal, paymentsPending };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveDashboardContext(req);
    if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
    if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

    const supa = ctx.supaService;
    const now = new Date().toISOString();

    // 1. Load all OPEN non-creditnote Holded invoices
    const { data: openInvoices, error: fetchErr } = await supa
      .from("invoices")
      .select("id, invoice_number, external_invoice_id, total_gross, client_id, invoice_date")
      .eq("source_provider", "holded")
      .eq("is_paid", false)
      .eq("state_code", "OPEN")
      .neq("document_type", "creditnote")
      .not("external_invoice_id", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(100);

    if (fetchErr) return json(500, { ok: false, error: fetchErr.message });
    if (!openInvoices?.length) return json(200, { ok: true, checked: 0, settled: 0, message: "No hay facturas OPEN que revisar" });

    // 2. Build date range for the Holded list fetch
    const sortedDates = (openInvoices as any[])
      .map((i: any) => i.invoice_date as string)
      .filter(Boolean)
      .sort();
    const oldestDate = new Date(sortedDates[0] ?? now);
    oldestDate.setDate(oldestDate.getDate() - 7);
    const startDate = oldestDate.toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    // 3. Fetch Holded LIST (has status field that detail endpoint doesn't return)
    type ListEntry = { status: string | null; listDate: string | null; raw: unknown };
    const holdedListMap = new Map<string, ListEntry>();
    let listFetchError: string | null = null;
    try {
      const listRows = await holdedListDocuments<Record<string, unknown>[]>("invoice", {
        startDate,
        endDate,
      });
      for (const row of (listRows ?? [])) {
        const id = String(row.id ?? row._id ?? "").trim();
        if (!id) continue;
        const status = resolveHoldedListStatus(row.status ?? row.docStatus);
        // Try to extract a bill/payment date from list row fields
        const listDate = unixToDateYmd(row.billDate ?? row.paymentDate ?? row.lastPaymentDate) ?? null;
        holdedListMap.set(id, { status, listDate, raw: row.status });
      }
    } catch (e: unknown) {
      listFetchError = String(e);
    }

    // 4. Load CNs grouped by client for paid_date fallback
    const clientIds = [...new Set((openInvoices as any[]).map((i: any) => i.client_id).filter(Boolean))];
    const { data: allCNs } = clientIds.length > 0
      ? await supa
          .from("invoices")
          .select("client_id, invoice_date, invoice_number, total_gross")
          .eq("source_provider", "holded")
          .eq("document_type", "creditnote")
          .in("client_id", clientIds)
      : { data: [] };

    const cnsByClient = new Map<string, { invoice_date: string; total_gross: number; invoice_number: string }[]>();
    for (const cn of (allCNs ?? []) as any[]) {
      if (!cn.client_id) continue;
      const abs = Math.abs(parseFloat(cn.total_gross) || 0);
      if (!cnsByClient.has(cn.client_id)) cnsByClient.set(cn.client_id, []);
      cnsByClient.get(cn.client_id)!.push({ ...cn, total_gross: abs });
    }

    let checked = 0;
    let settled = 0;
    let errors = 0;
    const details: { invoice_number: string; action: string; paid_date: string | null; cn_match?: string }[] = [];
    const openDiag: {
      invoice_number: string;
      list_status: string | null;
      list_status_raw: unknown;
      payments_total: number | null;
      payments_pending: number | null;
      holded_total: number | null;
      our_total_gross: number;
    }[] = [];

    for (const inv of openInvoices as any[]) {
      checked++;
      const totalGross = parseFloat(inv.total_gross) || 0;
      const extId = String(inv.external_invoice_id ?? "").trim();

      // Check list status first (most reliable source for paid/anulado)
      const listEntry = holdedListMap.get(extId);
      const listStatus = listEntry?.status ?? null;
      const isPaidByList = isStatusPaid(listStatus);
      const isCancelledByList = isStatusCancelled(listStatus);

      // Fetch detail for payment date and confirmation
      const detail = await fetchHoldedDetail(extId);
      const detailResult = detail ? extractPaidFromDetail(detail, totalGross) : null;
      const isPaidByDetail = detailResult?.isPaid ?? false;

      const shouldSettle = isPaidByDetail || isPaidByList || isCancelledByList;

      if (!shouldSettle) {
        openDiag.push({
          invoice_number: inv.invoice_number,
          list_status: listStatus,
          list_status_raw: listEntry?.raw ?? null,
          payments_total: detailResult?.paymentsTotal ?? null,
          payments_pending: detailResult?.paymentsPending ?? null,
          holded_total: detail ? (asNumber(detail["total"]) ?? totalGross) : null,
          our_total_gross: totalGross,
        });
        if (!detail) errors++;
        continue;
      }

      // Determine paid_date
      let paidDate: string | null = detailResult?.paidDate ?? listEntry?.listDate ?? null;
      let cnMatch: string | undefined;
      let action: string;

      if (isCancelledByList && !isPaidByDetail && !isPaidByList) {
        // Invoice cancelled by Holded (via CN or manually) — not "paid" but closed
        action = "cancelled_by_holded";
      } else {
        action = "settled_payments";
        // Try CN matching for paid_date if not found
        if (!paidDate && inv.client_id) {
          const clientCNs = cnsByClient.get(inv.client_id) ?? [];
          const matching = clientCNs
            .filter((cn) => Math.abs(cn.total_gross - totalGross) <= EPSILON + 0.05)
            .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
          if (matching.length > 0) {
            paidDate = matching[0].invoice_date;
            cnMatch = matching[0].invoice_number;
            action = `settled_via_cn:${cnMatch}`;
          }
        }
      }

      // is_paid = true only for genuinely paid invoices, not cancelled ones
      const finalIsPaid = isPaidByDetail || isPaidByList;

      const { error: updateErr } = await supa
        .from("invoices")
        .update({
          is_paid: finalIsPaid,
          state_code: "SETTLED",
          paid_date: finalIsPaid ? paidDate : null,
          due_date: detail ? extractDueDate(detail) : null,
          updated_at: now,
          needs_review: finalIsPaid && !paidDate,
        })
        .eq("id", inv.id);

      if (updateErr) { errors++; continue; }

      settled++;
      details.push({ invoice_number: inv.invoice_number, action, paid_date: finalIsPaid ? paidDate : null, cn_match: cnMatch });
    }

    return json(200, {
      ok: true,
      checked,
      settled,
      errors,
      remaining_open: (openInvoices as any[]).length - settled,
      details,
      open_diagnostics: openDiag,
      list_fetch_error: listFetchError,
      list_map_size: holdedListMap.size,
    });
  } catch (err: unknown) {
    return json(500, { ok: false, error: String(err) });
  }
}
