import { createClient } from "@supabase/supabase-js";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  external_invoice_id: string | null;
  source_meta: Record<string, unknown> | null;
};

type HoldedProduct = Record<string, unknown>;
type HoldedDetail = {
  id?: string;
  docNumber?: string;
  products?: HoldedProduct[];
};

type InvoiceItemInsert = {
  invoice_id: string;
  product_id: string | null;
  description: string;
  units: number;
  unit_net_price: number;
  line_net_amount: number;
  vat_rate: number;
  line_vat_amount: number;
  line_gross_amount: number;
  line_type: string;
  state_code: string;
  holded_product_id: string | null;
  sku: string | null;
  holded_variant_id: string | null;
};

const TARGET_INVOICES = ["F260047", "F260049", "F260050"] as const;
const HOLDED_API_BASE = "https://api.holded.com/api/invoicing/v1";
const HOLDED_DOC_TYPE = "invoice";

function requireEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).trim();
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toInt(value: unknown, fallback = 0): number {
  const n = toNumber(value, fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return fallback;
  return String(value).trim();
}

function pickFirstText(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const v = obj[key];
    const s = toText(v, "");
    if (s) return s;
  }
  return fallback;
}

function pickFirstNumber(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const v = obj[key];
    const n = toNumber(v, Number.NaN);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function deriveDocumentId(invoice: InvoiceRow): string {
  const fromExternal = toText(invoice.external_invoice_id, "");
  if (fromExternal) return fromExternal;

  const sourceMeta = invoice.source_meta || {};
  const holdedId = toText(sourceMeta["holded_id"], "");
  if (holdedId) return holdedId;

  throw new Error(`No Holded document id found for ${invoice.invoice_number}`);
}

function computeLine(product: HoldedProduct, invoiceId: string): InvoiceItemInsert {
  const description =
    pickFirstText(product, ["desc", "description", "name", "title"], "") || "Sin descripción";

  const unitsRaw = pickFirstNumber(product, ["units", "qty", "quantity"], 0);
  const units = Math.max(0, toInt(unitsRaw, 0));

  const unitNetPrice = pickFirstNumber(
    product,
    ["price", "unitPrice", "unit_price", "subtotal", "subTotal"],
    0
  );

  const subtotal =
    pickFirstNumber(product, ["subtotal", "subTotal", "base"], Number.NaN);

  const taxPercent = pickFirstNumber(product, ["tax", "vat", "taxPercent", "tax_percentage"], 0);

  const amount = Number.isFinite(subtotal)
    ? subtotal
    : unitNetPrice * units;

  const lineNetAmount = round2(amount);
  const vatRate = round4(taxPercent);

  const lineVatAmount =
    Number.isFinite(lineNetAmount) && Number.isFinite(vatRate)
      ? round2(lineNetAmount * (vatRate / 100))
      : 0;

  const lineGrossAmount = round2(lineNetAmount + lineVatAmount);

  const holdedProductId = pickFirstText(
    product,
    ["productId", "product_id", "idProduct", "product"],
    ""
  ) || null;

  const holdedVariantId = pickFirstText(
    product,
    ["variantId", "variant_id", "idVariant", "variant"],
    ""
  ) || null;

  const sku =
    pickFirstText(product, ["sku", "reference", "barcode"], "") || null;

  const rawLineType = pickFirstText(product, ["lineType", "line_type", "type"], "").toLowerCase();

  const inferredPromotion =
    rawLineType === "promotion" ||
    lineNetAmount === 0 ||
    unitNetPrice === 0 ||
    /promo/i.test(description);

  const lineType = inferredPromotion ? "promotion" : "sale";

  return {
    invoice_id: invoiceId,
    product_id: null,
    description,
    units,
    unit_net_price: round6(unitNetPrice),
    line_net_amount: lineNetAmount,
    vat_rate: vatRate,
    line_vat_amount: lineVatAmount,
    line_gross_amount: lineGrossAmount,
    line_type: lineType,
    state_code: "OPEN",
    holded_product_id: holdedProductId,
    sku,
    holded_variant_id: holdedVariantId,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
}

async function fetchHoldedDetail(apiKey: string, documentId: string): Promise<HoldedDetail> {
  const res = await fetch(`${HOLDED_API_BASE}/documents/${HOLDED_DOC_TYPE}/${documentId}`, {
    method: "GET",
    headers: {
      key: apiKey,
      accept: "application/json",
    },
  });

  const text = await res.text();
  let body: unknown = text;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // leave body as text
  }

  if (!res.ok) {
    throw new Error(
      `Holded detail fetch failed for ${documentId}: HTTP ${res.status} - ${typeof body === "string" ? body : JSON.stringify(body)}`
    );
  }

  if (!body || typeof body !== "object") {
    throw new Error(`Holded detail for ${documentId} is empty or invalid`);
  }

  return body as HoldedDetail;
}

async function main() {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    throw new Error(
      "Missing env var: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL or VITE_SUPABASE_URL"
    );
  }

  const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const holdedApiKey = requireEnv("HOLDED_API_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("1) Leyendo facturas objetivo desde Supabase...");

  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, invoice_number, external_invoice_id, source_meta")
    .in("invoice_number", [...TARGET_INVOICES])
    .eq("source_month", "2026-03")
    .order("invoice_number", { ascending: true });

  if (invoicesError) {
    throw new Error(`Supabase invoices query failed: ${invoicesError.message}`);
  }

  const rows = (invoices || []) as InvoiceRow[];

  if (rows.length !== TARGET_INVOICES.length) {
    console.log("AVISO: no se han encontrado todas las facturas objetivo.");
    console.log("Esperadas:", TARGET_INVOICES.join(", "));
    console.log("Encontradas:", rows.map((r) => r.invoice_number).join(", "));
  }

  for (const invoice of rows) {
    console.log(`\n2) Procesando ${invoice.invoice_number}...`);

    const documentId = deriveDocumentId(invoice);
    console.log(`   Holded document id: ${documentId}`);

    const detail = await fetchHoldedDetail(holdedApiKey, documentId);
    const rawProducts = Array.isArray(detail.products) ? detail.products : [];

    if (rawProducts.length === 0) {
      throw new Error(
        `${invoice.invoice_number}: Holded devuelve 0 productos. No se toca nada.`
      );
    }

    const mapped = rawProducts.map((p) => computeLine(p, invoice.id));

    console.log(`   Productos Holded: ${rawProducts.length}`);
    console.log(`   Líneas mapeadas : ${mapped.length}`);

    const { error: deleteError } = await supabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", invoice.id);

    if (deleteError) {
      throw new Error(
        `${invoice.invoice_number}: delete invoice_items failed: ${deleteError.message}`
      );
    }

    const { error: insertError } = await supabase
      .from("invoice_items")
      .insert(mapped);

    if (insertError) {
      throw new Error(
        `${invoice.invoice_number}: insert invoice_items failed: ${insertError.message}`
      );
    }

    console.log(`   OK: ${invoice.invoice_number} rehidratada.`);
  }

  console.log("\n3) Validación final rápida...");

  const { data: validation, error: validationError } = await supabase
    .from("invoice_items")
    .select("invoice_id, description, units, line_net_amount")
    .in(
      "invoice_id",
      rows.map((r) => r.id)
    );

  if (validationError) {
    throw new Error(`Validation query failed: ${validationError.message}`);
  }

  console.log(`   Total líneas recuperadas: ${validation?.length || 0}`);
  console.log("\nFIN OK");
}

main().catch((err) => {
  console.error("\nERROR");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});