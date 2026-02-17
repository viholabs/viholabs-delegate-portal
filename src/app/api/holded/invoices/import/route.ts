// src/app/api/holded/invoices/import/route.ts
/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Reason: Supabase error: "no unique or exclusion constraint matching ON CONFLICT"
 * Scope: Remove ON CONFLICT upsert; implement manual lookup+update/insert.
 * No UI changes. No schema changes.
 *
 * Evidence:
 * - invoices_currency_check => currency must be 'EUR' (or NULL)
 * - invoices_state_code_fkey => system_states(code) (OPEN, PENDING_REVIEW, ...)
 * - invoice_items_line_type_chk => line_type IN ('sale','promotion')
 * - Canon rule (user): units > 0 => sale ; units == 0 => promotion
 *
 * HARDENING (2026-02-17):
 * - Concurrency guard (process lock) to prevent parallel imports under load (best-effort).
 * - Idempotency hardening: resolve duplicates against DB unique (source_provider, invoice_number).
 *   If external_invoice_id is new but invoice_number already exists for same provider -> UPDATE instead of INSERT.
 * - No changes to economic semantics.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tryAcquireLock, releaseLock } from "@/lib/infra/processLock";

export const runtime = "nodejs";

// Import lock TTL: import can take time under load.
// Prevent storm / overlaps; recover if stale.
const IMPORT_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
        total?: number | null; // optional
        subtotal?: number | null; // optional
      }>
    | null;
};

type ImportError = {
  holded_id: string | null;
  step: string;
  error: string;
  meta?: any;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function holdedIdFromAny(x: any): string | null {
  const raw = x?.id ?? x?._id ?? null;
  if (!raw) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function parseLimit(v: string | null, fallback: number, max = 200): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
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

/**
 * Evidence:
 * invoices_currency_check = CHECK ((currency = 'EUR'::text))
 *
 * Rule:
 * - "eur" / "EUR" -> "EUR"
 * - any other -> null + needs_review=true
 */
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
 * Canon mapping for invoice_items.line_type (DB CHECK):
 * - units > 0  => 'sale'
 * - units == 0 => 'promotion'
 */
function lineTypeFromUnits(units: number): "sale" | "promotion" {
  return units > 0 ? "sale" : "promotion";
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function holdedFetch<T>(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const apiKey = env("HOLDED_API_KEY");
  const base = "https://api.holded.com/api/invoicing/v1";
  const url = new URL(base + path);

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json", key: apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `HOLDED_HTTP_${res.status} ${res.statusText}${txt ? ` — ${txt.slice(0, 400)}` : ""}`.trim()
    );
  }

  return (await res.json()) as T;
}

function supabaseAdmin() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type InvoiceLookup = {
  source_provider: string;
  external_invoice_id: string;
  invoice_number: string | null;
};

async function writeInvoiceIdempotent(
  supabase: ReturnType<typeof supabaseAdmin>,
  lookup: InvoiceLookup,
  payload: Record<string, any>
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  // 1) lookup existing by (provider, external_invoice_id)
  const foundByExternal = await supabase
    .from("invoices")
    .select("id, external_invoice_id, invoice_number")
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

  // 2) fallback lookup by (provider, invoice_number) to satisfy DB unique constraint (invoices_uq_provider_number)
  const invNum = String(lookup.invoice_number ?? "").trim();
  if (invNum) {
    const foundByNumber = await supabase
      .from("invoices")
      .select("id, external_invoice_id, invoice_number")
      .eq("source_provider", lookup.source_provider)
      .eq("invoice_number", invNum)
      .maybeSingle();

    if (foundByNumber.error) return { ok: false, error: foundByNumber.error.message };

    if (foundByNumber.data?.id) {
      const prevExternal = String(foundByNumber.data.external_invoice_id ?? "").trim() || null;

      // Preserve evidence in source_meta if external id changed (no schema change).
      if (payload?.source_meta && typeof payload.source_meta === "object") {
        const nextMeta: any = { ...(payload.source_meta as any) };
        if (prevExternal && prevExternal !== lookup.external_invoice_id) {
          nextMeta.holded_external_invoice_id_previous = prevExternal;
        }
        payload = { ...payload, source_meta: nextMeta };
      }

      // Update the row that matches provider+invoice_number; also align external_invoice_id to current holded id.
      const upd = await supabase
        .from("invoices")
        .update({ ...payload, external_invoice_id: lookup.external_invoice_id })
        .eq("id", foundByNumber.data.id)
        .select("id")
        .single();

      if (upd.error) return { ok: false, error: upd.error.message };
      return { ok: true, invoiceId: String(upd.data.id) };
    }
  }

  // 3) insert
  const ins = await supabase.from("invoices").insert(payload).select("id").single();
  if (ins.error) return { ok: false, error: ins.error.message };
  return { ok: true, invoiceId: String(ins.data.id) };
}

async function importOneHoldedInvoice(
  supabase: ReturnType<typeof supabaseAdmin>,
  holdedId: string
): Promise<{ ok: true } | { ok: false; err: ImportError }> {
  // DETAIL
  let detail: HoldedInvoiceDetail;
  try {
    detail = await holdedFetch<HoldedInvoiceDetail>(`/documents/invoice/${encodeURIComponent(holdedId)}`);
  } catch (e: any) {
    return { ok: false, err: { holded_id: holdedId, step: "holded_detail", error: String(e?.message ?? e) } };
  }

  const invoiceNumber = (detail.docNumber ?? "").toString().trim();
  if (!invoiceNumber) {
    return {
      ok: false,
      err: {
        holded_id: holdedId,
        step: "invoice_number",
        error: "Missing invoice_number (Holded docNumber is null/empty)",
        meta: { docNumber: detail.docNumber ?? null },
      },
    };
  }

  const unix = Number(detail.date ?? NaN);
  if (!Number.isFinite(unix) || unix <= 0) {
    return {
      ok: false,
      err: {
        holded_id: holdedId,
        step: "invoice_date",
        error: "Missing/invalid invoice_date (Holded date is null/invalid)",
        meta: { date: detail.date ?? null },
      },
    };
  }

  const invoiceDateISO = unixToISODate(unix);
  const sourceMonth = sourceMonthFromISODate(invoiceDateISO);

  const normCurrency = normalizeCurrencyForInvoicesCheck(detail.currency);
  const needsReview = normCurrency.needsReview;

  // Evidence: invoices_state_code_fkey -> system_states(code)
  const stateCode = needsReview ? "PENDING_REVIEW" : "OPEN";

  const totalNet = safeNumber(detail.subtotal, 0);
  const totalVat = safeNumber(detail.tax, 0);
  const totalGross = safeNumber(detail.total, 0);

  // Invoice payload: only known columns (per your described schema)
  const invoicePayload: Record<string, any> = {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDateISO,
    currency: normCurrency.currency, // 'EUR' or null
    total_net: totalNet,
    total_vat: totalVat,
    total_gross: totalGross,
    source_month: sourceMonth,
    source_provider: "holded",
    external_invoice_id: holdedId,
    needs_review: needsReview,
    state_code: stateCode,
    source_meta: {
      provider: "holded",
      holded_id: holdedId,
      holded_currency_raw: normCurrency.raw,
      holded_docNumber: detail.docNumber ?? null,
      holded_date_unix: detail.date ?? null,
    },
    updated_at: new Date().toISOString(),
  };

  // Write invoice idempotently WITHOUT onConflict
  const w = await writeInvoiceIdempotent(
    supabase,
    { source_provider: "holded", external_invoice_id: holdedId, invoice_number: invoiceNumber },
    invoicePayload
  );

  if (!w.ok) {
    return {
      ok: false,
      err: {
        holded_id: holdedId,
        step: "invoice_write",
        error: w.error,
        meta: { currency_sent: invoicePayload.currency, currency_raw: normCurrency.raw, state_code_sent: stateCode },
      },
    };
  }

  const invoiceId = w.invoiceId;

  // Replace items
  const del = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (del.error) {
    return { ok: false, err: { holded_id: holdedId, step: "items_delete", error: del.error.message } };
  }

  const products = Array.isArray(detail.products) ? detail.products : [];
  const rows: any[] = [];

  for (const p of products) {
    const units = safeNumber(p?.units, 0);

    // Fail honest if units negative (future-proof vs units_nonneg_chk, even if NOT VALID now)
    if (units < 0) {
      return {
        ok: false,
        err: {
          holded_id: holdedId,
          step: "items_units",
          error: "Negative units encountered (refusing to guess / clamp)",
          meta: { units_raw: p?.units ?? null, name: p?.name ?? null, description: p?.description ?? null },
        },
      };
    }

    const unitNet = safeNumber(p?.price, 0);
    const vatRate = safeNumber(p?.tax, 0);

    const lineNet = units * unitNet;
    const lineVat = lineNet * (vatRate / 100);
    const lineGross = lineNet + lineVat;

    const lineType = lineTypeFromUnits(units); // CANONICAL

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
      line_type: lineType, // must be 'sale' | 'promotion'
      state_code: stateCode,
      product_id: null,
    });
  }

  if (rows.length > 0) {
    const ins = await supabase.from("invoice_items").insert(rows as any);
    if (ins.error) {
      return {
        ok: false,
        err: { holded_id: holdedId, step: "items_insert", error: ins.error.message, meta: { state_code_sent: stateCode } },
      };
    }
  }

  return { ok: true };
}

async function listHoldedInvoiceIds(limit: number): Promise<string[]> {
  const list = await holdedFetch<HoldedInvoiceListItem[]>("/documents/invoice");
  const ids: string[] = [];
  for (const it of Array.isArray(list) ? list : []) {
    const id = holdedIdFromAny(it);
    if (id) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

async function runImport(limit: number) {
  const supabase = supabaseAdmin();
  const ids = await listHoldedInvoiceIds(limit);

  let imported = 0;
  const errors: ImportError[] = [];

  for (const id of ids) {
    const r = await importOneHoldedInvoice(supabase, id);
    if (r.ok) imported += 1;
    else errors.push(r.err);
  }

  return { imported_count: imported, error_count: errors.length, errors };
}

export async function GET(req: Request) {
  // Concurrency guard at entry-point (before fetch/supabase) — best-effort.
  const acquired = tryAcquireLock(IMPORT_LOCK_TTL_MS, "holded_invoices_import");
  if (!acquired) {
    return json(409, { ok: false, stage: "busy", error: "Busy (import already running)" });
  }

  try {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"), 20, 200);
    const out = await runImport(limit);
    return json(200, { ok: true, limit, ...out });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message ?? e) });
  } finally {
    releaseLock("holded_invoices_import");
  }
}

// POST compatibility for tunnels
export async function POST(req: Request) {
  return GET(req);
}
