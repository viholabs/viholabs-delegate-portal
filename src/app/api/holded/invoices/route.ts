// src/app/api/holded/invoices/route.ts
/**
 * VIHOLABS — HOLDED → SUPABASE — Credit Notes (CN) Semàntica Econòmica
 *
 * Canon:
 * - NO unitats negatives (invoice_items_units_nonneg_chk)
 * - Imports monetaris negatius POSSIBLES, però per CN: mantenir positius i aplicar signe al motor de comissions
 * - CN s’importa a public.invoices, sense schema alternatiu
 * - Afegir semàntica explícita a source_meta:
 *   document_kind: "INVOICE" | "CREDIT_NOTE"
 *   document_series: "F" | "CN"
 *   is_credit_note: boolean
 *
 * PAS 2: ONLY backend import route. No UI. No schema.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type HoldedDocType = "invoice" | "creditnote";

type HoldedProductLine = {
  name?: string | null;
  desc?: string | null;
  price?: number | null;
  units?: number | null;
  tax?: number | null;
  taxes?: string[] | null;
  discount?: number | null;
  sku?: string | number | null;
  productId?: string | null;
  variantId?: string | null;
};

type HoldedDoc = {
  id: string;
  docNumber?: string | null;
  status?: number | null;
  draft?: unknown;
  approvedAt?: number | null;

  contact?: string | null;
  contactName?: string | null;

  date?: number | null;
  dueDate?: number | null;
  accountingDate?: number | null;

  language?: string | null;

  currency?: string | null;
  currencyChange?: number | null;

  subtotal?: number | null;
  tax?: number | null;
  discount?: number | null;
  total?: number | null;

  notes?: string | null;
  desc?: string | null;
  tags?: unknown[] | null;

  products?: HoldedProductLine[] | null;

  from?: { id?: string | null; docType?: string | null } | null;

  // Allow unknown fields without guessing:
  [k: string]: unknown;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function toUpperCurrency(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "EUR";
  return s.toUpperCase();
}

function isCreditNoteByEvidence(args: { docType: HoldedDocType; doc: HoldedDoc }): boolean {
  // Primary truth: endpoint docType ("creditnote")
  if (args.docType === "creditnote") return true;

  // Fallback admissible (per contract): prefix in docNumber (data origen)
  const dn = String(args.doc.docNumber ?? "").trim().toUpperCase();
  if (dn.startsWith("CN")) return true;

  return false;
}

function seriesFor(args: { isCreditNote: boolean }): "F" | "CN" {
  return args.isCreditNote ? "CN" : "F";
}

function kindFor(args: { isCreditNote: boolean }): "INVOICE" | "CREDIT_NOTE" {
  return args.isCreditNote ? "CREDIT_NOTE" : "INVOICE";
}

function absMoney(n: unknown): number {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return 0;
  return Math.abs(x);
}

function numOr0(n: unknown): number {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return 0;
  return x;
}

function unitsNonNeg(n: unknown): number {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return 0;
  // Canon: units negatives prohibides. Mai les emetem.
  return x < 0 ? 0 : x;
}

function lineTypeFromUnits(units: number): "sale" | "promotion" {
  // Canon establert:
  // units > 0 => "sale"
  // units = 0 => "promotion"
  return units > 0 ? "sale" : "promotion";
}

async function holdedFetchJSON<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      // Holded API auth (observat funcionant): header "key"
      key: apiKey,
    },
    // no credentials; server-to-server
  });

  const text = await res.text();
  if (!res.ok) {
    // fallo honest amb evidència retornada
    throw new Error(`Holded HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Holded returned non-JSON :: ${text.slice(0, 500)}`);
  }
}

async function listHoldedDocuments(docType: HoldedDocType, apiKey: string): Promise<HoldedDoc[]> {
  const url = `https://api.holded.com/api/invoicing/v1/documents/${docType}`;
  return holdedFetchJSON<HoldedDoc[]>(url, apiKey);
}

async function getHoldedDocumentDetail(docType: HoldedDocType, id: string, apiKey: string): Promise<HoldedDoc> {
  const url = `https://api.holded.com/api/invoicing/v1/documents/${docType}/${id}`;
  return holdedFetchJSON<HoldedDoc>(url, apiKey);
}

/**
 * DB mapping (conservador):
 * - No inventa camps nous a DB.
 * - Només afegeix claus dins source_meta.
 *
 * IMPORTANT:
 * - Ajusta els noms de columnes SI el teu schema real difereix.
 * - Aquest fitxer NO toca schema, només escriu.
 */
type DbInvoiceUpsert = {
  source_provider: string;
  external_invoice_id: string;

  doc_number: string | null;

  currency: string;

  issued_at: string | null; // ISO
  due_at: string | null; // ISO

  subtotal: number;
  tax: number;
  discount: number;
  total: number;

  customer_name: string | null;

  status_raw: string | null;

  source_meta: Record<string, unknown>;
};

type DbInvoiceItemInsert = {
  // we attach by (source_provider, external_invoice_id, line_index) idempotently
  source_provider: string;
  external_invoice_id: string;
  line_index: number;

  description: string | null;

  units: number;
  unit_price: number;

  line_type: "sale" | "promotion";

  tax_rate: number | null;

  source_meta: Record<string, unknown>;
};

function tsToIsoOrNull(ts: unknown): string | null {
  const n = Number(ts ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Holded timestamps are seconds (observed like 1770764400)
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildInvoiceUpsert(args: { docType: HoldedDocType; doc: HoldedDoc }): DbInvoiceUpsert {
  const isCN = isCreditNoteByEvidence({ docType: args.docType, doc: args.doc });

  const kind = kindFor({ isCreditNote: isCN });
  const series = seriesFor({ isCreditNote: isCN });

  const docNumber = args.doc.docNumber ? String(args.doc.docNumber) : null;

  // Canon: per CN mantenim imports positius.
  // Per INVOICE: mantenim valors tal com venen (no fem inferències).
  const subtotal = isCN ? absMoney(args.doc.subtotal) : numOr0(args.doc.subtotal);
  const tax = isCN ? absMoney(args.doc.tax) : numOr0(args.doc.tax);
  const discount = isCN ? absMoney(args.doc.discount) : numOr0(args.doc.discount);
  const total = isCN ? absMoney(args.doc.total) : numOr0(args.doc.total);

  const currency = toUpperCurrency(args.doc.currency);
  // Constraint real a DB: currency='EUR'
  // Fallo honest si no és EUR.
  if (currency !== "EUR") {
    throw new Error(`Currency not allowed by DB check: got ${currency}`);
  }

  const issuedAt = tsToIsoOrNull(args.doc.date);
  const dueAt = tsToIsoOrNull(args.doc.dueDate);

  const statusRaw = args.doc.status != null ? String(args.doc.status) : null;

  const source_meta: Record<string, unknown> = {
    // Semàntica canònica (claus acordades)
    document_kind: kind,
    document_series: series,
    is_credit_note: isCN,

    // Evidència origen (sense inventar)
    holded: {
      id: args.doc.id,
      docType: args.docType,
      docNumber: docNumber,
      status: args.doc.status ?? null,
      draft: args.doc.draft ?? null,
      approvedAt: args.doc.approvedAt ?? null,
      from: args.doc.from ?? null,
    },
  };

  return {
    source_provider: "holded",
    external_invoice_id: args.doc.id,

    doc_number: docNumber,

    currency,

    issued_at: issuedAt,
    due_at: dueAt,

    subtotal,
    tax,
    discount,
    total,

    customer_name: args.doc.contactName ? String(args.doc.contactName) : null,

    status_raw: statusRaw,

    source_meta,
  };
}

function buildInvoiceItems(args: { docType: HoldedDocType; doc: HoldedDoc }): DbInvoiceItemInsert[] {
  const isCN = isCreditNoteByEvidence({ docType: args.docType, doc: args.doc });
  const lines = Array.isArray(args.doc.products) ? args.doc.products : [];

  const out: DbInvoiceItemInsert[] = [];

  for (let i = 0; i < lines.length; i++) {
    const p = lines[i] ?? {};

    const units = unitsNonNeg(p.units);

    // Canon: per CN, imports positius (abs). Per invoice, tal com ve.
    const unitPrice = isCN ? absMoney(p.price) : numOr0(p.price);

    const descriptionParts: string[] = [];
    if (p.name) descriptionParts.push(String(p.name));
    if (p.desc) descriptionParts.push(String(p.desc));
    const description = descriptionParts.length ? descriptionParts.join(" — ") : null;

    const taxRate = p.tax == null ? null : numOr0(p.tax);

    out.push({
      source_provider: "holded",
      external_invoice_id: args.doc.id,
      line_index: i,

      description,

      units,
      unit_price: unitPrice,

      line_type: lineTypeFromUnits(units),

      tax_rate: taxRate,

      source_meta: {
        holded: {
          productId: (p as HoldedProductLine).productId ?? null,
          variantId: (p as HoldedProductLine).variantId ?? null,
          sku: (p as HoldedProductLine).sku ?? null,
          taxes: (p as HoldedProductLine).taxes ?? null,
          discount: (p as HoldedProductLine).discount ?? null,
        },
      },
    });
  }

  return out;
}

async function upsertInvoicesAndItems(args: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  docs: Array<{ docType: HoldedDocType; doc: HoldedDoc }>;
}) {
  const supabase = createClient(args.supabaseUrl, args.supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // 1) Upsert invoices
  const invoicesPayload: DbInvoiceUpsert[] = args.docs.map(({ docType, doc }) =>
    buildInvoiceUpsert({ docType, doc }),
  );

  // IMPORTANT: onConflict requires unique constraint/index in DB.
  // If your schema uses a different key, this will fail honestly and we will adapt with evidence.
  const upInv = await supabase
    .from("invoices")
    .upsert(invoicesPayload, { onConflict: "source_provider,external_invoice_id" })
    .select("external_invoice_id");

  if (upInv.error) {
    throw new Error(`Supabase upsert invoices failed: ${upInv.error.message}`);
  }

  // 2) Replace items deterministically (idempotent):
  //    - delete existing items for those external ids
  //    - insert new computed items
  const externalIds = invoicesPayload.map((x) => x.external_invoice_id);

  // Delete
  const del = await supabase
    .from("invoice_items")
    .delete()
    .in("external_invoice_id", externalIds)
    .eq("source_provider", "holded");

  if (del.error) {
    throw new Error(`Supabase delete invoice_items failed: ${del.error.message}`);
  }

  // Insert
  const itemsPayload: DbInvoiceItemInsert[] = [];
  for (const { docType, doc } of args.docs) {
    itemsPayload.push(...buildInvoiceItems({ docType, doc }));
  }

  if (itemsPayload.length > 0) {
    const ins = await supabase.from("invoice_items").insert(itemsPayload);
    if (ins.error) {
      throw new Error(`Supabase insert invoice_items failed: ${ins.error.message}`);
    }
  }

  return {
    invoices_upserted: invoicesPayload.length,
    items_inserted: itemsPayload.length,
  };
}

export async function GET(req: Request) {
  try {
    // Authn/Acl: This route is server-side ingestion.
    // If you already gate this via internal network or caller auth, keep it there.
    // Here we do NOT implement UI auth changes (forbidden by contract).
    const url = new URL(req.url);

    // Optional: ?detail=1 to fetch DETAIL for each doc.
    // Default: use LIST objects (already include products etc).
    const wantDetail = url.searchParams.get("detail") === "1";

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const holdedApiKey = requireEnv("HOLDED_API_KEY");

    // Fetch both doc types deterministically.
    const [invoicesList, creditNotesList] = await Promise.all([
      listHoldedDocuments("invoice", holdedApiKey),
      listHoldedDocuments("creditnote", holdedApiKey),
    ]);

    // If detail=1, fetch detail per document id.
    // This is deterministic; not heuristic.
    const docs: Array<{ docType: HoldedDocType; doc: HoldedDoc }> = [];

    if (wantDetail) {
      for (const d of invoicesList) {
        if (!d?.id) continue;
        const det = await getHoldedDocumentDetail("invoice", d.id, holdedApiKey);
        docs.push({ docType: "invoice", doc: det });
      }
      for (const d of creditNotesList) {
        if (!d?.id) continue;
        const det = await getHoldedDocumentDetail("creditnote", d.id, holdedApiKey);
        docs.push({ docType: "creditnote", doc: det });
      }
    } else {
      // Use the list objects as-is.
      for (const d of invoicesList) {
        if (!d?.id) continue;
        docs.push({ docType: "invoice", doc: d });
      }
      for (const d of creditNotesList) {
        if (!d?.id) continue;
        docs.push({ docType: "creditnote", doc: d });
      }
    }

    const result = await upsertInvoicesAndItems({
      supabaseUrl,
      supabaseServiceKey,
      docs,
    });

    return json(200, {
      ok: true,
      fetched: {
        invoices: invoicesList.length,
        creditnotes: creditNotesList.length,
        used_detail: wantDetail,
      },
      written: result,
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      error: e?.message ?? "Unknown error",
    });
  }
}
