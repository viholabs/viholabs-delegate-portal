// src/lib/holded/holdedLineClassifier.ts
//
// VIHOLABS — Holded Line Classifier (CANONICAL)
// Single source of truth for:
//   - Product SKU sets (SALE / PROMO / NEUTRAL)
//   - Line item bucket inference (sold / promo / discount / neutral units)
//   - Invoice unit aggregation
//
// DO NOT redefine SKU sets or inferBucketFromItem inline in route files.

import { norm, normText, asNumber, firstNumber } from "./holdedPrimitives";

// ---------------------------------------------------------------------------
// SKU catalogs — update here, one place, for all routes
// ---------------------------------------------------------------------------

export const SALE_SKUS = new Set<string>([
  "VIHO-OBE-SPRAY-002",
]);

export const PROMO_SKUS = new Set<string>([
  "VIHO-OBE-PROMO-001",
  "VIHO-OBE-PROMO-002",
  "VIHO-OBE-PROMO-003",
  "VIHO-OBE-PROMO-CP-12M",
  "VIHO-OBE-PROMO-PLUS-4M",
]);

export const NEUTRAL_SKUS = new Set<string>([
  "VIHO-BOOK-BASCULA",
]);

/**
 * Exact text values (normalized/diacritics-stripped) that are always NEUTRAL
 * regardless of SKU or line_type.
 * REGLA CRÍTICA: "Estándar" y sku "0" deben ser NEUTRAL SIEMPRE.
 */
export const NEUTRAL_TEXT_EXACT = new Set<string>([
  "estandar",
  "estándar",
  "standard",
]);

// ---------------------------------------------------------------------------
// Item field accessors
// ---------------------------------------------------------------------------

/** Extracts and normalizes SKU from an invoice line item (multiple field names) */
export function getItemSku(item: Record<string, unknown>): string {
  return norm(
    item["sku"] ??
      item["product_sku"] ??
      item["productSku"] ??
      item["variant_sku"] ??
      item["variantSku"] ??
      item["external_sku"] ??
      item["externalSku"] ??
      item["reference"] ??
      ""
  );
}

/** Extracts and normalizes display text from an invoice line item */
export function getItemText(item: Record<string, unknown>): string {
  return normText(
    item["name"] ??
      item["product_name"] ??
      item["productName"] ??
      item["description"] ??
      item["desc"] ??
      item["line_name"] ??
      item["title"] ??
      ""
  );
}

/**
 * Returns true if the line must always be classified as NEUTRAL.
 * "Estándar" lines and sku "0" are always neutral regardless of line_type.
 */
export function isNeutralStandardLine(text: string, sku: string): boolean {
  if (NEUTRAL_TEXT_EXACT.has(text)) return true;
  if (sku === "0") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Explicit bucket fields (advanced Holded invoices with pre-broken-down units)
// ---------------------------------------------------------------------------

export function getExplicitBucketUnits(item: Record<string, unknown>) {
  const sold = firstNumber(
    item["units_sale"],
    item["sale_units"],
    item["sold_units"],
    item["unitsSold"]
  );
  const promo = firstNumber(
    item["units_promo"],
    item["units_foc"],
    item["promo_units"],
    item["foc_units"],
    item["unitsPromo"],
    item["unitsFoc"]
  );
  const discount = firstNumber(
    item["units_discount"],
    item["discount_units"],
    item["unitsDiscount"]
  );
  const neutral = firstNumber(
    item["units_neutral"],
    item["neutral_units"],
    item["unitsNeutral"]
  );

  const hasAnyExplicit =
    sold !== null || promo !== null || discount !== null || neutral !== null;

  return {
    hasAnyExplicit,
    sold: sold ?? 0,
    promo: promo ?? 0,
    discount: discount ?? 0,
    neutral: neutral ?? 0,
  };
}

export function getBaseQuantity(item: Record<string, unknown>): number {
  const qty =
    firstNumber(
      item["quantity"],
      item["qty"],
      item["units"],
      item["unit_count"],
      item["amount_units"],
      item["count"]
    ) ?? 0;
  return Number.isFinite(qty) ? qty : 0;
}

// ---------------------------------------------------------------------------
// Canonical bucket inference
// ---------------------------------------------------------------------------

/**
 * Infers the unit bucket (sold / promo / discount / neutral) from a single
 * invoice line item.
 *
 * Priority order:
 *   1. Neutral standard line (Estándar / sku "0") — always neutral
 *   2. Explicit pre-broken-down bucket fields
 *   3. `kind` / `line_type` field
 *   4. SKU catalog lookup
 *   5. Text heuristics
 *   6. Fallback: neutral
 */
export function inferBucketFromItem(item: Record<string, unknown>) {
  const qty = getBaseQuantity(item);
  const sku = getItemSku(item);
  const text = getItemText(item);

  // REGLA CRÍTICA: neutral-standard always wins before everything else
  if (isNeutralStandardLine(text, sku)) {
    return { sold: 0, promo: 0, discount: 0, neutral: qty };
  }

  const explicit = getExplicitBucketUnits(item);
  if (explicit.hasAnyExplicit) {
    return explicit;
  }

  const kind = normText(
    item["kind"] ??
      item["line_type"] ??
      item["lineType"] ??
      item["item_kind"] ??
      item["itemKind"] ??
      item["classification"] ??
      item["class"] ??
      ""
  );

  const lineNet = firstNumber(
    item["line_net_amount"],
    item["net_amount"],
    item["subtotal"],
    item["base_amount"],
    item["amount"]
  );

  // SKU catalog takes priority over raw line_type — Holded often marks promo lines
  // as "sale" because they carry a price; the SKU is the authoritative classification.
  if (sku && SALE_SKUS.has(sku)) {
    return { sold: qty, promo: 0, discount: 0, neutral: 0 };
  }
  if (sku && PROMO_SKUS.has(sku)) {
    return { sold: 0, promo: qty, discount: 0, neutral: 0 };
  }
  if (sku && NEUTRAL_SKUS.has(sku)) {
    return { sold: 0, promo: 0, discount: 0, neutral: qty };
  }

  if (kind.includes("discount") || kind.includes("descuento")) {
    return { sold: 0, promo: 0, discount: qty, neutral: 0 };
  }
  if (kind.includes("neutral") || kind.includes("neutro")) {
    return { sold: 0, promo: 0, discount: 0, neutral: qty };
  }
  if (kind.includes("sale") || kind.includes("venta") || kind.includes("sold")) {
    return { sold: qty, promo: 0, discount: 0, neutral: 0 };
  }
  if (kind.includes("promo") || kind.includes("promotion") || kind.includes("foc")) {
    return { sold: 0, promo: qty, discount: 0, neutral: 0 };
  }

  if (
    text.includes("descuento") ||
    text.includes("discount") ||
    (lineNet !== null && lineNet < 0)
  ) {
    return { sold: 0, promo: 0, discount: qty, neutral: 0 };
  }
  if (text.includes("promo") || text.includes("muestra") || text.includes("foc")) {
    return { sold: 0, promo: qty, discount: 0, neutral: 0 };
  }

  return { sold: 0, promo: 0, discount: 0, neutral: qty };
}

export type InvoiceUnitBuckets = {
  sold: number;
  promo: number;
  discount: number;
  neutral: number;
};

/** Sums unit buckets across all line items of an invoice */
export function sumInvoiceUnits(items: unknown[]): InvoiceUnitBuckets {
  let sold = 0;
  let promo = 0;
  let discount = 0;
  let neutral = 0;

  for (const raw of items) {
    const item = typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
    if (!item) continue;

    const bucket = inferBucketFromItem(item);
    sold += bucket.sold;
    promo += bucket.promo;
    discount += bucket.discount;
    neutral += bucket.neutral;
  }

  return { sold, promo, discount, neutral };
}

/** Convenience: classify a single SKU string directly */
export function classifyLineTypeBySku(
  sku: string | null
): "sale" | "promotion" | "neutral" {
  if (!sku) return "neutral";
  if (SALE_SKUS.has(sku)) return "sale";
  if (PROMO_SKUS.has(sku)) return "promotion";
  if (NEUTRAL_SKUS.has(sku)) return "neutral";
  return "neutral";
}
