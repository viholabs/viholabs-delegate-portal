// src/lib/holded/holdedInvoiceImporter.ts
/**
 * VIHOLABS — HOLDed Invoice Importer (single invoice by Holded ID)
 *
 * Canon:
 * - No UI
 * - Deterministic
 * - Uses canonical Holded façade (holdedFetch / holdedFetchJson)
 * - PROMO classification is amount-based (0€), not units-based
 *
 * Robustness (canonical operational rule):
 * - If Holded docNumber is missing/empty, we DO NOT invent invoice_number.
 * - We return a deterministic SKIP result so incremental cursor is not blocked by upstream-corrupt docs.
 * - This preserves "DB = truth" and avoids permanent deadlocks.
 */

import { holdedFetch, holdedFetchJson } from "@/lib/holded/holdedFetch";
import { supabaseAdmin as supabaseAdminClient } from "@/lib/supabase/admin";

type HoldedInvoiceListItem = {
  id?: string;
  _id?: string;
  docNumber?: string | null;
};

type HoldedInvoiceDetail = {
  id?: string;
  _id?: string;

  date?: number | null; // unix seconds
  docNumber?: string | null;

  currency?: string | null;

  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;

  products?:
    | Array<{
        name?: string | null;
        description?: string | null;
        units?: number | null;
        price?: number | null;
        tax?: number | null; // VAT rate (%)
        total?: number | null;
        subtotal?: number | null;
      }>
    | null;
};

export type ImportError = {
  holded_id: string | null;
  step: string;
  error: string;
  meta?: any;
};

export type ImportOk = { ok: true };
export type ImportFail = { ok: false; err: ImportError };
export type ImportSkip = { ok: false; skipped: true; err: ImportError };

export type ImportResult = ImportOk | ImportFail | ImportSkip;

function holdedIdFromAny(x: any): string | null {
  const raw = x?.id ?? x?._id ?? null;
  if (!raw) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function unixToISODate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sourceMonthFromISODate(isoDate: string): string {
  const [y, m] = isoDate.split("-");
  return `${y}-${m}`;
}

function normalizeCurrencyForInvoicesCheck(raw: unknown): {
  currency: "EUR" | null;
  needsReview: boolean;
  raw: string | null;
} {
  if (raw == null) return { currency: null, needsReview: true, raw: null };
  const s = String(raw).trim();
  if (!s) return { currency: null, needsReview: true, raw: null };
  if (s === "EUR") return { currency: "EUR", needsReview: false, raw: s };
  if (s.toLowerCase() === "eur") return { currency: "EUR", needsReview: false, raw: s };
  return { currency: null, needsReview: true, raw: s };
}

/**
 * ✅ CANON: promo is amount-based (0€), not units-based
 * Deterministic:
 * - promotion if line_net_amount == 0 OR line_gross_amount == 0
 * - sale otherwise
 */
function lineTypeFromAmounts(lineNetAmount: number, lineGrossAmount: number): "sale" | "promotion" {
  const isPromo = lineNetAmount === 0 || lineGrossAmount === 0;
  return isPromo ? "promotion" : "sale";
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeISOFromUnknown(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function extractContactIdCandidate(detailAny: any): string | null {
  const candidates: any[] = [
    detailAny?.contactId,
    detailAny?.contact?.id,
    detailAny?.contact?._id,
    detailAny?.client?.id,
    detailAny?.client?._id,
    detailAny?.customer?.id,
    detailAny?.customer?._id,
  ];

  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return null;
}

async function writeInvoiceIdempotent(
  supabase: ReturnType<typeof supabaseAdminClient>,
  lookup: { source_provider: string; external_invoice_id: string; invoice_number: string },
  payload: any
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const foundByExternal = await supabase
    .from("invoices")
    .select("id")
    .eq("source_provider", lookup.source_provider)
    .eq("external_invoice_id", lookup.external_invoice_id)
    .maybeSingle();

  if (foundByExternal.error) return { ok: false, error: foundByExternal.error.message };
  if (foundByExternal.data?.id) {
    const upd = await supabase
      .from("invoices")
      .update(payload)
      .eq("id", foundByExternal.data.id)
      .select("id")
      .single();

    if (upd.error) return { ok: false, error: upd.error.message };
    return { ok: true, invoiceId: String(upd.data.id) };
  }

  const foundByNumber = await supabase
    .from("invoices")
    .select("id, external_invoice_id")
    .eq("source_provider", lookup.source_provider)
    .eq("invoice_number", lookup.invoice_number)
    .maybeSingle();

  if (foundByNumber.error) return { ok: false, error: foundByNumber.error.message };
  if (foundByNumber.data?.id) {
    const upd = await supabase
      .from("invoices")
      .update({ ...payload, external_invoice_id: lookup.external_invoice_id })
      .eq("id", foundByNumber.data.id)
      .select("id")
      .single();

    if (upd.error) return { ok: false, error: upd.error.message };
    return { ok: true, invoiceId: String(upd.data.id) };
  }

  const ins = await supabase.from("invoices").insert(payload).select("id").single();
  if (ins.error) return { ok: false, error: ins.error.message };
  return { ok: true, invoiceId: String(ins.data.id) };
}

export async function importOneHoldedInvoiceById(
  supabase: ReturnType<typeof supabaseAdminClient>,
  holdedId: string
): Promise<ImportResult> {
  let detail: HoldedInvoiceDetail;
  try {
    // ✅ Canonical signature (docType, id)
    detail = await holdedFetch<HoldedInvoiceDetail>("invoice", holdedId);
  } catch (e: any) {
    return {
      ok: false,
      err: { holded_id: holdedId, step: "holded_detail", error: String(e?.message ?? e) },
    };
  }

  const invoiceNumber = (detail.docNumber ?? "").toString().trim();

  // ✅ Canonical SKIP: never invent invoice_number
  if (!invoiceNumber) {
    return {
      ok: false,
      skipped: true,
      err: {
        holded_id: holdedId,
        step: "invoice_number",
        error: "SKIP: Missing invoice_number (Holded docNumber is null/empty)",
        meta: { holded_docNumber: detail.docNumber ?? null },
      },
    };
  }

  const unix = Number(detail.date ?? NaN);
  if (!Number.isFinite(unix) || unix <= 0) {
    return {
      ok: false,
      err: { holded_id: holdedId, step: "invoice_date", error: "Missing/invalid invoice_date" },
    };
  }

  const invoiceDateISO = unixToISODate(unix);
  const sourceMonth = sourceMonthFromISODate(invoiceDateISO);

  const normCurrency = normalizeCurrencyForInvoicesCheck(detail.currency);
  const needsReview = normCurrency.needsReview;
  const stateCode = needsReview ? "PENDING_REVIEW" : "OPEN";

  const totalNet = safeNumber(detail.subtotal, 0);
  const totalVat = safeNumber(detail.tax, 0);
  const totalGross = safeNumber(detail.total, 0);

  const detailAny = detail as any;
  const detailKeys = detailAny && typeof detailAny === "object" ? Object.keys(detailAny).sort() : [];
  const contactIdCandidate = extractContactIdCandidate(detailAny);

  const clientName =
    (detailAny?.contactName ??
      detailAny?.contact?.name ??
      detailAny?.client?.name ??
      detailAny?.customer?.name ??
      null) as string | null;

  const externalModifiedAtISO = safeISOFromUnknown(
    detailAny?.updatedAt ?? detailAny?.modifiedAt ?? null
  );

  const invoicePayload: Record<string, any> = {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDateISO,
    currency: normCurrency.currency,
    total_net: totalNet,
    total_vat: totalVat,
    total_gross: totalGross,
    source_month: sourceMonth,
    source_provider: "holded",
    external_invoice_id: holdedId,
    needs_review: needsReview,
    state_code: stateCode,

    client_name: clientName,
    external_modified_at: externalModifiedAtISO,

    source_meta: {
      provider: "holded",
      holded_id: holdedId,
      holded_currency_raw: normCurrency.raw,
      holded_docNumber: detail.docNumber ?? null,
      holded_date_unix: detail.date ?? null,
      holded_detail_keys: detailKeys,
      holded_contact_id_candidate: contactIdCandidate,
    },

    updated_at: new Date().toISOString(),
  };

  const w = await writeInvoiceIdempotent(
    supabase,
    { source_provider: "holded", external_invoice_id: holdedId, invoice_number: invoiceNumber },
    invoicePayload
  );

  if (!w.ok) {
    return { ok: false, err: { holded_id: holdedId, step: "invoice_write", error: w.error } };
  }

  const invoiceId = w.invoiceId;

  // 1) Build rows FIRST. Canon: never wipe existing evidence if we have no replacement rows.
  const products = Array.isArray((detail as any)?.products) ? (detail as any).products : [];
  const rows: any[] = [];

  for (const p of products) {
    const units = safeNumber(p?.units, 0);
    if (units < 0) {
      return {
        ok: false,
        err: { holded_id: holdedId, step: "items_units", error: "Negative units encountered" },
      };
    }

    const unitNet = safeNumber(p?.price, 0);
    const vatRate = safeNumber(p?.tax, 0);

    const lineNet = units * unitNet;
    const lineVat = lineNet * (vatRate / 100);
    const lineGross = lineNet + lineVat;

    const lineType = lineTypeFromAmounts(lineNet, lineGross);

    const descriptionBase = (p?.description ?? p?.name ?? "").toString().trim();
    const description = descriptionBase || "(no description)";

    rows.push({
      invoice_id: invoiceId,
      description,
      units,
      unit_net_price: unitNet,
      line_net_amount: lineNet,
      vat_rate: vatRate,
      line_vat_amount: lineVat,
      line_gross_amount: lineGross,
      line_type: lineType,
      state_code: stateCode,
      product_id: null,
    });
  }

  // 2) If no rows, do NOT delete existing items (canon: preserve evidence).
  if (rows.length === 0) {
    // Canon: preserve evidence. If we have no replacement rows, we do NOT wipe existing items.
    return { ok: true };
  }

  // 3) Replace deterministically: delete then insert.
  const del = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (del.error) {
    return { ok: false, err: { holded_id: holdedId, step: "items_delete", error: del.error.message } };
  }

  const ins = await supabase.from("invoice_items").insert(rows as any);
  if (ins.error) {
    return { ok: false, err: { holded_id: holdedId, step: "items_insert", error: ins.error.message } };
  }

  return { ok: true };
}

export async function listHoldedInvoiceIds(limit: number): Promise<string[]> {
  // ✅ Canonical signature (docType, query?)
  const list = await holdedFetchJson<HoldedInvoiceListItem[]>("invoice");
  const ids: string[] = [];
  for (const it of Array.isArray(list) ? list : []) {
    const id = holdedIdFromAny(it);
    if (id) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}