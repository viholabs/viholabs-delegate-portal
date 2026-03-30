import process from "node:process";
import { createClient } from "@supabase/supabase-js";

type HoldedInvoiceListRow = Record<string, unknown>;
type HoldedInvoiceDetail = Record<string, unknown>;
type HoldedLine = Record<string, unknown>;

type InvoiceInsertRow = {
  invoice_number: string;
  invoice_date: string | null;
  client_id: string | null;
  source_provider: string;
  source_month: string | null;
  state_code: string;
  external_invoice_id: string;
  holded_contact_id: string | null;
  client_name: string | null;
  source_channel: string | null;
  currency: string | null;
  total_net: number;
  total_vat: number;
  total_gross: number;
  is_paid: boolean;
  paid_date: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};

type InvoiceItemTempRow = {
  external_invoice_id: string;
  description: string;
  units: number;
  unit_net_price: number;
  line_net_amount: number;
  vat_rate: number;
  line_vat_amount: number;
  line_gross_amount: number;
  line_type: string;
  created_at: string;
  state_code: string;
  holded_product_id: string | null;
  sku: string | null;
  holded_variant_id: string | null;
};

type InvoiceItemInsertRow = {
  invoice_id: string;
  product_id: null;
  description: string;
  units: number;
  unit_net_price: number;
  line_net_amount: number;
  vat_rate: number;
  line_vat_amount: number;
  line_gross_amount: number;
  line_type: string;
  created_at: string;
  state_code: string;
  holded_product_id: string | null;
  sku: string | null;
  holded_variant_id: string | null;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return v.trim();
}

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asInt(v: unknown): number | null {
  const n = asNum(v);
  if (n === null) return null;
  return Math.trunc(n);
}

function asBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "si", "sí"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function parseUnixDateSeconds(v: unknown): string | null {
  const n = asNum(v);
  if (n === null) return null;
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parsePossibleDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  if (typeof v === "number") {
    return parseUnixDateSeconds(v);
  }

  const s = String(v).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

function extractInvoiceDate(row: Record<string, unknown>): string | null {
  return (
    parsePossibleDate(row.date) ??
    parsePossibleDate(row.invoiceDate) ??
    parsePossibleDate(row.issuedDate) ??
    parsePossibleDate(row.createdAt) ??
    null
  );
}

function extractPaidDate(row: Record<string, unknown>): string | null {
  return (
    parsePossibleDate(row.paidDate) ??
    parsePossibleDate(row.paymentDate) ??
    parsePossibleDate(row.paid_at) ??
    null
  );
}

function monthFromDate(dateStr: string | null): string | null {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.slice(0, 7);
}

function normalizeCurrencyForInvoicesCheck(raw: unknown): "EUR" | null {
  if (raw === null || raw === undefined) return null;

  const s = String(raw).trim();
  if (!s) return null;

  if (s === "EUR") return "EUR";
  if (s.toLowerCase() === "eur") return "EUR";
  if (s === "€") return "EUR";
  if (s.toLowerCase() === "euro") return "EUR";

  return null;
}

function pickExternalInvoiceId(row: Record<string, unknown>): string {
  const candidates = [row.id, row._id, row.docId, row.documentId];
  for (const c of candidates) {
    const v = asText(c);
    if (v) return v;
  }
  throw new Error(`Invoice without external id: ${JSON.stringify(row)}`);
}

function extractHoldedContactId(row: Record<string, unknown>): string | null {
  const contact = row.contact;
  if (contact && typeof contact === "object" && !Array.isArray(contact)) {
    const obj = contact as Record<string, unknown>;
    return asText(obj.id ?? obj._id ?? obj.contactId);
  }

  return asText(row.contactId ?? row.contact_id ?? row.clientId);
}

function extractInvoiceLines(detail: HoldedInvoiceDetail): HoldedLine[] {
  const candidates = [
    detail.products,
    detail.items,
    detail.lines,
    detail.invoiceLines,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c as HoldedLine[];
  }

  return [];
}

function normalizeLineType(line: HoldedLine): string {
  const rawType =
    asText(line.lineType) ??
    asText(line.type) ??
    asText(line.kind) ??
    "";

  const t = rawType.toLowerCase();

  if (["promo", "promotion", "gift", "free"].includes(t)) {
    return "promotion";
  }

  return "sale";
}

function normalizeLineDescription(line: HoldedLine): string {
  return (
    asText(line.desc) ??
    asText(line.description) ??
    asText(line.name) ??
    "LINE"
  );
}

function normalizeLineUnits(line: HoldedLine): number {
  return (
    asInt(line.units) ??
    asInt(line.quantity) ??
    asInt(line.qty) ??
    0
  );
}

function normalizeUnitNetPrice(line: HoldedLine): number {
  return (
    asNum(line.price) ??
    asNum(line.unitPrice) ??
    asNum(line.unitNetPrice) ??
    0
  );
}

function normalizeLineNetAmount(line: HoldedLine, units: number, unitNetPrice: number): number {
  return (
    asNum(line.subtotal) ??
    asNum(line.lineNetAmount) ??
    asNum(line.net) ??
    units * unitNetPrice
  );
}

function normalizeVatRate(line: HoldedLine): number {
  return (
    asNum(line.tax) ??
    asNum(line.vat) ??
    asNum(line.vatRate) ??
    0
  );
}

function normalizeLineVatAmount(line: HoldedLine): number {
  return (
    asNum(line.taxAmount) ??
    asNum(line.vatAmount) ??
    asNum(line.lineVatAmount) ??
    0
  );
}

function normalizeLineGrossAmount(line: HoldedLine, lineNetAmount: number, lineVatAmount: number): number {
  return (
    asNum(line.total) ??
    asNum(line.lineGrossAmount) ??
    lineNetAmount + lineVatAmount
  );
}

function extractSku(line: HoldedLine): string | null {
  return asText(line.sku ?? line.reference);
}

function extractHoldedProductId(line: HoldedLine): string | null {
  const product = line.product;
  if (product && typeof product === "object" && !Array.isArray(product)) {
    const obj = product as Record<string, unknown>;
    return asText(obj.id ?? obj._id ?? obj.productId);
  }

  return asText(line.productId ?? line.product_id);
}

function extractHoldedVariantId(line: HoldedLine): string | null {
  const variant = line.variant;
  if (variant && typeof variant === "object" && !Array.isArray(variant)) {
    const obj = variant as Record<string, unknown>;
    return asText(obj.id ?? obj._id ?? obj.variantId);
  }

  return asText(line.variantId ?? line.variant_id);
}

async function holdedGet<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`https://api.holded.com${path}`, {
    method: "GET",
    headers: {
      key: apiKey,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Holded GET ${path} failed: HTTP ${res.status} :: ${body}`);
  }

  return (await res.json()) as T;
}

async function fetchAllDocuments(
  apiKey: string,
  docType: "invoice" | "creditnote"
): Promise<HoldedInvoiceListRow[]> {
  const path = `/api/invoicing/v1/documents/${docType}`;
  const data = await holdedGet<unknown>(path, apiKey);

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected Holded response for ${path}: expected array`);
  }

  return data as HoldedInvoiceListRow[];
}

async function fetchInvoiceDetail(
  apiKey: string,
  docType: "invoice" | "creditnote",
  id: string
): Promise<HoldedInvoiceDetail> {
  const path = `/api/invoicing/v1/documents/${docType}/${id}`;
  return await holdedGet<HoldedInvoiceDetail>(path, apiKey);
}

async function main(): Promise<void> {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  console.log("1) Fetching Holded invoices list...");
  const invoiceRows = await fetchAllDocuments(holdedApiKey, "invoice");

  console.log("2) Fetching Holded credit notes list...");
  const creditRows = await fetchAllDocuments(holdedApiKey, "creditnote");

  const allRows = [
    ...invoiceRows.map((r) => ({ docType: "invoice" as const, row: r })),
    ...creditRows.map((r) => ({ docType: "creditnote" as const, row: r })),
  ];

  const filtered = allRows.filter(({ row }) => {
    const invoiceDate = extractInvoiceDate(row);
    return invoiceDate !== null && invoiceDate >= "2026-03-01";
  });

  console.log(`   OK: total docs received       = ${allRows.length}`);
  console.log(`   OK: docs kept from 2026-03-01 = ${filtered.length}`);

  const invoiceRowsToInsert: InvoiceInsertRow[] = [];
  const invoiceItemRows: InvoiceItemTempRow[] = [];

  for (const item of filtered) {
    const externalInvoiceId = pickExternalInvoiceId(item.row);
    const detail = await fetchInvoiceDetail(holdedApiKey, item.docType, externalInvoiceId);

    const invoiceDate = extractInvoiceDate(detail) ?? extractInvoiceDate(item.row);
    const paidDate = extractPaidDate(detail) ?? extractPaidDate(item.row);
    const holdedContactId = extractHoldedContactId(detail) ?? extractHoldedContactId(item.row);

    const { data: mappedClient, error: mapError } = await supabase
      .from("holded_contact_client_map_g1")
      .select("client_id")
      .eq("holded_contact_id", holdedContactId)
      .maybeSingle();

    if (mapError) {
      throw new Error(`Error reading holded_contact_client_map_g1 for ${holdedContactId}: ${mapError.message}`);
    }

    const sourceMonth = monthFromDate(invoiceDate);

    invoiceRowsToInsert.push({
      invoice_number:
        asText(detail.docNumber ?? detail.number ?? item.row.docNumber ?? item.row.number) ??
        externalInvoiceId,
      invoice_date: invoiceDate,
      client_id: mappedClient?.client_id ?? null,
      source_provider: "holded",
      source_month: sourceMonth,
      state_code: "OPEN",
      external_invoice_id: externalInvoiceId,
      holded_contact_id: holdedContactId,
      client_name:
        asText((detail.contact as Record<string, unknown> | undefined)?.name) ??
        asText((item.row.contact as Record<string, unknown> | undefined)?.name) ??
        null,
      source_channel: null,
      currency: normalizeCurrencyForInvoicesCheck(detail.currency ?? item.row.currency),
      total_net:
        asNum(detail.subtotal ?? detail.totalNet ?? item.row.subtotal ?? item.row.totalNet) ?? 0,
      total_vat:
        asNum(detail.totalTax ?? detail.totalVat ?? item.row.totalTax ?? item.row.totalVat) ?? 0,
      total_gross:
        asNum(detail.total ?? detail.totalGross ?? item.row.total ?? item.row.totalGross) ?? 0,
      is_paid: asBool(detail.paid ?? item.row.paid) ?? false,
      paid_date: paidDate,
      needs_review: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const lines = extractInvoiceLines(detail);

    for (const line of lines) {
      const units = normalizeLineUnits(line);
      const unitNetPrice = normalizeUnitNetPrice(line);
      const lineNetAmount = normalizeLineNetAmount(line, units, unitNetPrice);
      const vatRate = normalizeVatRate(line);
      const lineVatAmount = normalizeLineVatAmount(line);
      const lineGrossAmount = normalizeLineGrossAmount(line, lineNetAmount, lineVatAmount);

      invoiceItemRows.push({
        external_invoice_id: externalInvoiceId,
        description: normalizeLineDescription(line),
        units,
        unit_net_price: unitNetPrice,
        line_net_amount: lineNetAmount,
        vat_rate: vatRate,
        line_vat_amount: lineVatAmount,
        line_gross_amount: lineGrossAmount,
        line_type: normalizeLineType(line),
        created_at: new Date().toISOString(),
        state_code: "OPEN",
        holded_product_id: extractHoldedProductId(line),
        sku: extractSku(line),
        holded_variant_id: extractHoldedVariantId(line),
      });
    }
  }

  console.log("3) Inserting invoices...");
  if (invoiceRowsToInsert.length > 0) {
    const { error } = await supabase
      .from("invoices")
      .insert(invoiceRowsToInsert);

    if (error) {
      throw new Error(`Supabase insert invoices failed: ${error.message}`);
    }
  }

  console.log("4) Resolving invoice ids...");
  const externalIds = invoiceRowsToInsert.map((x) => x.external_invoice_id);

  const { data: insertedInvoices, error: insertedInvoicesError } = await supabase
    .from("invoices")
    .select("id, external_invoice_id")
    .in("external_invoice_id", externalIds);

  if (insertedInvoicesError) {
    throw new Error(`Supabase select invoices failed: ${insertedInvoicesError.message}`);
  }

  const invoiceIdByExternalId = new Map<string, string>();
  for (const row of insertedInvoices ?? []) {
    const ext = asText((row as Record<string, unknown>).external_invoice_id);
    const id = asText((row as Record<string, unknown>).id);
    if (ext && id) invoiceIdByExternalId.set(ext, id);
  }

  const finalInvoiceItems: InvoiceItemInsertRow[] = [];

  for (const row of invoiceItemRows) {
    const invoiceId = invoiceIdByExternalId.get(row.external_invoice_id);
    if (!invoiceId) continue;

    finalInvoiceItems.push({
      invoice_id: invoiceId,
      product_id: null,
      description: row.description,
      units: row.units,
      unit_net_price: row.unit_net_price,
      line_net_amount: row.line_net_amount,
      vat_rate: row.vat_rate,
      line_vat_amount: row.line_vat_amount,
      line_gross_amount: row.line_gross_amount,
      line_type: row.line_type,
      created_at: row.created_at,
      state_code: row.state_code,
      holded_product_id: row.holded_product_id,
      sku: row.sku,
      holded_variant_id: row.holded_variant_id,
    });
  }

  console.log("5) Inserting invoice_items...");
  if (finalInvoiceItems.length > 0) {
    const { error } = await supabase
      .from("invoice_items")
      .insert(finalInvoiceItems);

    if (error) {
      throw new Error(`Supabase insert invoice_items failed: ${error.message}`);
    }
  }

  console.log("DONE");
  console.log(`Imported invoices     : ${invoiceRowsToInsert.length}`);
  console.log(`Imported invoiceitems : ${finalInvoiceItems.length}`);
}

main().catch((err) => {
  console.error("ERROR");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});