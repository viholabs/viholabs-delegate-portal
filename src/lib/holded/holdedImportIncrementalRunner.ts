/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { holdedFetchJson } from "./holdedFetch";
import { buildHoldedImportDecision } from "./holdedInvoiceImporter";

type SupabaseLike = {
  from: (table: string) => any;
};

type IncrementalDocInput = {
  summary: Record<string, unknown>;
  detail: Record<string, unknown>;
};

type ClientResolution = {
  holdedContactExists: boolean;
  clientId: string | null;
  delegateId: string | null;
  mappingExists: boolean;
  clientExists: boolean;
};

function toNullableString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

function toNumber(raw: unknown, fallback = 0): number {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCurrencyValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;

  const s = String(raw).trim();
  if (!s) return null;

  if (s === "EUR") return "EUR";
  if (s.toLowerCase() === "eur") return "EUR";
  if (s === "€") return "EUR";
  if (s.toLowerCase() === "euro") return "EUR";

  return s.toUpperCase();
}

function normalizeInvoiceStateCode(raw: unknown): string {
  const s = toNullableString(raw)?.toUpperCase() ?? "";

  if (!s) return "OPEN";

  if (s === "PENDING") return "OPEN";

  if (s === "OPEN") return "OPEN";
  if (s === "PENDING_REVIEW") return "PENDING_REVIEW";
  if (s === "VALID") return "VALID";
  if (s === "INVALID") return "INVALID";
  if (s === "LOCKED") return "LOCKED";
  if (s === "SETTLED") return "SETTLED";
  if (s === "FAILED") return "FAILED";

  return "OPEN";
}

function isCreditNoteDocument(row: any): boolean {
  const sourceMeta = row?.source_meta ?? null;

  const holdedDocKind =
    typeof sourceMeta?.holded_doc_kind === "string"
      ? sourceMeta.holded_doc_kind.trim().toLowerCase()
      : "";

  if (holdedDocKind === "credit_note") {
    return true;
  }

  const invoiceNumber =
    typeof row?.invoice_number === "string"
      ? row.invoice_number.trim().toUpperCase()
      : "";

  if (invoiceNumber.startsWith("CN")) {
    return true;
  }

  return false;
}

function forceNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n === 0 ? 0 : -Math.abs(n);
}

function forcePositive(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n);
}

function normalizeInvoiceItemLineType(row: any): "sale" | "promotion" {
  const raw =
    typeof row?.line_type === "string"
      ? row.line_type.trim().toLowerCase()
      : "";

  if (raw === "sale" || raw === "promotion") {
    return raw;
  }

  const units = toNumber(row?.units ?? row?.quantity ?? 0, 0);
  const unitNetPrice = toNumber(row?.unit_net_price ?? row?.unit_price ?? 0, 0);
  const lineNetAmount = toNumber(
    row?.line_net_amount ?? row?.line_subtotal ?? 0,
    0
  );
  const vatRate = toNumber(row?.vat_rate ?? row?.tax_rate ?? 0, 0);
  const lineVatAmount = toNumber(
    row?.line_vat_amount ?? row?.vat_amount ?? 0,
    0
  );
  const lineGrossAmount = toNumber(
    row?.line_gross_amount ?? (lineNetAmount + lineVatAmount),
    0
  );

  const sku =
    row?.sku === null || row?.sku === undefined
      ? ""
      : String(row.sku).trim().toUpperCase();

  const description =
    typeof row?.description === "string"
      ? row.description.trim().toLowerCase()
      : "";

  const isEconomicallyZero =
    units === 0 &&
    unitNetPrice === 0 &&
    lineNetAmount === 0 &&
    vatRate === 0 &&
    lineVatAmount === 0 &&
    lineGrossAmount === 0;

  const looksPromotionBySku =
    sku.includes("PROMO") ||
    sku.includes("FOC") ||
    sku === "0";

  const looksPromotionByDescription =
    description.includes("promo") ||
    description.includes("promoción") ||
    description.includes("promocion") ||
    description.includes("gratis") ||
    description.includes("free");

  if (isEconomicallyZero || looksPromotionBySku || looksPromotionByDescription) {
    return "promotion";
  }

  return "sale";
}

function sanitizeItemRowForCurrentSchema(
  row: any,
  options?: { forceCreditNoteNegative?: boolean }
) {
  const forceCreditNoteNegative = Boolean(options?.forceCreditNoteNegative);

  let units = toNumber(row.units ?? row.quantity ?? 0, 0);
  let unitNetPrice = toNumber(row.unit_net_price ?? row.unit_price ?? 0, 0);
  let lineNetAmount = toNumber(
    row.line_net_amount ?? row.line_subtotal ?? units * unitNetPrice,
    0
  );
  const vatRate = toNumber(row.vat_rate ?? row.tax_rate ?? 0, 0);
  let lineVatAmount = toNumber(row.line_vat_amount ?? row.vat_amount ?? 0, 0);
  let lineGrossAmount = toNumber(
    row.line_gross_amount ?? (lineNetAmount + lineVatAmount),
    0
  );

  if (forceCreditNoteNegative) {
    units = forcePositive(units);
    unitNetPrice = forcePositive(unitNetPrice);
    lineNetAmount = forceNegative(lineNetAmount);
    lineVatAmount = forceNegative(lineVatAmount);
    lineGrossAmount = forceNegative(lineGrossAmount);
  } else {
    units = forcePositive(units);
    unitNetPrice = forcePositive(unitNetPrice);
  }

  return {
    product_id: row.product_id ?? null,
    description: toNullableString(row.description) ?? "",
    units,
    unit_net_price: unitNetPrice,
    line_net_amount: lineNetAmount,
    vat_rate: vatRate,
    line_vat_amount: lineVatAmount,
    line_gross_amount: lineGrossAmount,
    line_type: normalizeInvoiceItemLineType(row),
    created_at: row.created_at ?? new Date().toISOString(),
    state_code: normalizeInvoiceStateCode(row.state_code),
    holded_product_id: row.holded_product_id ?? row.productId ?? null,
    sku: toNullableString(row.sku),
    holded_variant_id: row.holded_variant_id ?? row.variantId ?? null,
  };
}

function computeInvoiceTotalsFromItems(items: any[]) {
  let totalNet = 0;
  let totalVat = 0;
  let totalGross = 0;

  for (const item of items) {
    totalNet += toNumber(item.line_net_amount, 0);
    totalVat += toNumber(item.line_vat_amount, 0);
    totalGross += toNumber(item.line_gross_amount, 0);
  }

  return {
    totalNet,
    totalVat,
    totalGross,
  };
}

function sanitizeInvoiceRowForCurrentSchema(
  row: any,
  sanitizedItems: any[],
  options?: { forceCreditNoteNegative?: boolean }
) {
  const forceCreditNoteNegative = Boolean(options?.forceCreditNoteNegative);
  const derivedTotals = computeInvoiceTotalsFromItems(sanitizedItems);

  let totalNet = toNumber(
    row.total_net ??
      row.subtotal ??
      row.totalNet ??
      row.net ??
      derivedTotals.totalNet,
    0
  );

  let totalVat = toNumber(
    row.total_vat ??
      row.tax ??
      row.totalVat ??
      row.vat ??
      derivedTotals.totalVat,
    0
  );

  let totalGross = toNumber(
    row.total_gross ??
      row.total ??
      row.totalGross ??
      row.gross ??
      derivedTotals.totalGross ??
      (totalNet + totalVat),
    totalNet + totalVat
  );

  if (forceCreditNoteNegative) {
    totalNet = forceNegative(totalNet);
    totalVat = forceNegative(totalVat);
    totalGross = forceNegative(totalGross);
  }

  return {
    source_provider: row.source_provider ?? "holded",
    external_invoice_id: row.external_invoice_id ?? null,
    invoice_number: row.invoice_number ?? null,
    invoice_date: row.invoice_date ?? null,
    client_name: row.client_name ?? null,
    holded_contact_id: row.holded_contact_id ?? null,
    client_id: row.client_id ?? null,
    delegate_id: row.delegate_id ?? null,
    currency: normalizeCurrencyValue(row.currency) ?? "EUR",
    total_net: totalNet,
    total_vat: totalVat,
    total_gross: totalGross,
    is_paid: row.is_paid ?? false,
    paid_date: row.paid_date ?? null,
    pdf_path: row.pdf_path ?? null,
    source_month:
      typeof row.invoice_date === "string" && row.invoice_date.length >= 7
        ? row.invoice_date.slice(0, 7)
        : null,
    source_filename: row.source_filename ?? null,
    source_file_hash: row.source_file_hash ?? null,
    parse_status: row.parse_status ?? null,
    parse_errors: row.parse_errors ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    source_meta: row.source_meta ?? null,
    source_channel: null,
    import_batch_id: row.import_batch_id ?? null,
    client_name_raw: row.client_name_raw ?? row.client_name ?? null,
    updated_at: row.updated_at ?? new Date().toISOString(),
    needs_review: row.needs_review ?? false,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by_actor_id: row.reviewed_by_actor_id ?? null,
    ops_owner_actor_id: row.ops_owner_actor_id ?? null,
    state_code: normalizeInvoiceStateCode(row.state_code),
    external_modified_at: row.external_modified_at ?? null,
  };
}

function pickFirstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = toNullableString(value);
    if (normalized) return normalized;
  }
  return null;
}

async function loadHoldedContactSnapshot(
  supabase: SupabaseLike,
  holdedContactId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("holded_contacts")
    .select("*")
    .eq("holded_id", holdedContactId)
    .maybeSingle();

  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

function buildHoldedContactUpsertPayload(
  holdedContactId: string,
  rawContact: Record<string, unknown>
) {
  const now = new Date().toISOString();

  const billingAddress =
    rawContact["billAddress"] && typeof rawContact["billAddress"] === "object"
      ? (rawContact["billAddress"] as Record<string, unknown>)
      : null;

  const shippingAddress =
    rawContact["shippingAddress"] && typeof rawContact["shippingAddress"] === "object"
      ? (rawContact["shippingAddress"] as Record<string, unknown>)
      : null;

  const customFields = Array.isArray(rawContact["customFields"])
    ? rawContact["customFields"]
    : [];

  const legalName = pickFirstNonEmpty(
    rawContact["legalName"],
    rawContact["legal_name"],
    rawContact["name"],
    rawContact["tradeName"],
    rawContact["trade_name"]
  );

  const tradeName = pickFirstNonEmpty(
    rawContact["tradeName"],
    rawContact["trade_name"],
    rawContact["name"],
    rawContact["legalName"],
    rawContact["legal_name"]
  );

  const email = pickFirstNonEmpty(
    rawContact["email"],
    rawContact["contactEmail"],
    rawContact["billingEmail"]
  );

  const phone = pickFirstNonEmpty(
    rawContact["phone"],
    rawContact["mobile"],
    rawContact["contactPhone"]
  );

  const vatNumber = pickFirstNonEmpty(
    rawContact["vatNumber"],
    rawContact["vat_number"],
    rawContact["taxId"],
    rawContact["tax_id"],
    rawContact["code"]
  );

  const entityTypeRaw = pickFirstNonEmpty(
    rawContact["entityType"],
    rawContact["entity_type"],
    rawContact["type"]
  );

  const entityType =
    entityTypeRaw?.toLowerCase() === "company" ? "company" : "person";

  return {
    holded_id: holdedContactId,
    updated_at: now,
    created_at: now,
    name: pickFirstNonEmpty(rawContact["name"], legalName, tradeName),
    legal_name: legalName,
    trade_name: tradeName,
    full_name: pickFirstNonEmpty(rawContact["name"], legalName, tradeName),
    company_name: pickFirstNonEmpty(tradeName, legalName),
    contact_name: pickFirstNonEmpty(rawContact["contactName"], rawContact["name"]),
    contact_email: email,
    billing_email: email,
    email,
    contact_phone: phone,
    phone,
    mobile: pickFirstNonEmpty(rawContact["mobile"], phone),
    vat_number: vatNumber,
    tax_id: vatNumber,
    fiscal_address_line1: pickFirstNonEmpty(
      billingAddress?.["address"],
      rawContact["address"]
    ),
    fiscal_address_line2: pickFirstNonEmpty(
      billingAddress?.["address2"],
      rawContact["address2"]
    ),
    fiscal_city: pickFirstNonEmpty(billingAddress?.["city"], rawContact["city"]),
    fiscal_region: pickFirstNonEmpty(
      billingAddress?.["province"],
      billingAddress?.["state"],
      rawContact["province"],
      rawContact["state"],
      rawContact["region"]
    ),
    fiscal_postal_code: pickFirstNonEmpty(
      billingAddress?.["postalCode"],
      billingAddress?.["zip"],
      rawContact["postalCode"],
      rawContact["zip"]
    ),
    fiscal_country: pickFirstNonEmpty(
      billingAddress?.["country"],
      rawContact["country"]
    ),
    bill_address_line1: pickFirstNonEmpty(
      billingAddress?.["address"],
      rawContact["address"]
    ),
    bill_address_line2: pickFirstNonEmpty(
      billingAddress?.["address2"],
      rawContact["address2"]
    ),
    billing_address_line1: pickFirstNonEmpty(
      billingAddress?.["address"],
      rawContact["address"]
    ),
    billing_address_line2: pickFirstNonEmpty(
      billingAddress?.["address2"],
      rawContact["address2"]
    ),
    entity_type: entityType,
    raw_json: rawContact,
    raw_payload: rawContact,
    raw: rawContact,
    shipping_address_line1: pickFirstNonEmpty(
      shippingAddress?.["address"],
      rawContact["shippingAddress1"]
    ),
    shipping_address_line2: pickFirstNonEmpty(
      shippingAddress?.["address2"],
      rawContact["shippingAddress2"]
    ),
    shipping_city: pickFirstNonEmpty(
      shippingAddress?.["city"],
      rawContact["shippingCity"]
    ),
    shipping_region: pickFirstNonEmpty(
      shippingAddress?.["province"],
      shippingAddress?.["state"],
      rawContact["shippingProvince"],
      rawContact["shippingState"]
    ),
    shipping_postal_code: pickFirstNonEmpty(
      shippingAddress?.["postalCode"],
      shippingAddress?.["zip"],
      rawContact["shippingPostalCode"]
    ),
    shipping_country: pickFirstNonEmpty(
      shippingAddress?.["country"],
      rawContact["shippingCountry"]
    ),
    custom_fields: customFields,
  };
}

async function syncHoldedContactIntoLocalSnapshot(args: {
  supabase: SupabaseLike;
  holdedContactId: string;
}): Promise<boolean> {
  const { supabase, holdedContactId } = args;

  const normalizedId = toNullableString(holdedContactId);
  if (!normalizedId) {
    return false;
  }

  const existing = await loadHoldedContactSnapshot(supabase, normalizedId);
  if (existing) {
    return true;
  }

  let remoteContact: Record<string, unknown> | null = null;

  try {
    const fetched = await holdedFetchJson(`/contacts/${normalizedId}`);
    if (fetched && typeof fetched === "object" && !Array.isArray(fetched)) {
      remoteContact = fetched as Record<string, unknown>;
    }
  } catch {
    remoteContact = null;
  }

  if (!remoteContact) {
    return false;
  }

  const payload = buildHoldedContactUpsertPayload(normalizedId, remoteContact);

  const { error } = await supabase
    .from("holded_contacts")
    .upsert(payload, { onConflict: "holded_id" });

  if (error) throw error;

  const reloaded = await loadHoldedContactSnapshot(supabase, normalizedId);
  return Boolean(reloaded);
}

function buildClientInsertFromHoldedContact(
  holdedContactId: string,
  holdedContactRow: Record<string, unknown>
) {
  const now = new Date().toISOString();

  const name = pickFirstNonEmpty(
    holdedContactRow["legal_name"],
    holdedContactRow["trade_name"],
    holdedContactRow["name"],
    holdedContactRow["full_name"],
    holdedContactRow["contact_name"],
    holdedContactRow["company_name"]
  );

  const email = pickFirstNonEmpty(
    holdedContactRow["contact_email"],
    holdedContactRow["billing_email"],
    holdedContactRow["email"]
  );

  const phone = pickFirstNonEmpty(
    holdedContactRow["contact_phone"],
    holdedContactRow["mobile"],
    holdedContactRow["phone"]
  );

  const legalName = pickFirstNonEmpty(
    holdedContactRow["legal_name"],
    holdedContactRow["name"],
    holdedContactRow["full_name"]
  );

  const vatNumber = pickFirstNonEmpty(
    holdedContactRow["vat_number"],
    holdedContactRow["tax_id"],
    holdedContactRow["vat"]
  );

  const fiscalAddressLine1 = pickFirstNonEmpty(
    holdedContactRow["fiscal_address_line1"],
    holdedContactRow["address"],
    holdedContactRow["bill_address_line1"],
    holdedContactRow["billing_address_line1"]
  );

  const fiscalAddressLine2 = pickFirstNonEmpty(
    holdedContactRow["fiscal_address_line2"],
    holdedContactRow["address2"],
    holdedContactRow["bill_address_line2"],
    holdedContactRow["billing_address_line2"]
  );

  const fiscalCity = pickFirstNonEmpty(
    holdedContactRow["fiscal_city"],
    holdedContactRow["city"]
  );

  const fiscalRegion = pickFirstNonEmpty(
    holdedContactRow["fiscal_region"],
    holdedContactRow["province"],
    holdedContactRow["region"],
    holdedContactRow["state"]
  );

  const fiscalPostalCode = pickFirstNonEmpty(
    holdedContactRow["fiscal_postal_code"],
    holdedContactRow["postal_code"],
    holdedContactRow["zip"],
    holdedContactRow["zipcode"]
  );

  const fiscalCountry = pickFirstNonEmpty(
    holdedContactRow["fiscal_country"],
    holdedContactRow["country"]
  );

  const isCompanyRaw = holdedContactRow["entity_type"];
  const isCompany =
    typeof isCompanyRaw === "string"
      ? isCompanyRaw.trim().toLowerCase() === "company"
      : null;

  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    state_code: "OPEN",
    status: "active",
    holded_contact_id: holdedContactId,
    name,
    name_raw: name,
    legal_name: legalName,
    contact_email: email,
    billing_email: email,
    contact_phone: phone,
    vat_number: vatNumber,
    tax_id: vatNumber,
    fiscal_address_line1: fiscalAddressLine1,
    fiscal_address_line2: fiscalAddressLine2,
    fiscal_city: fiscalCity,
    fiscal_region: fiscalRegion,
    fiscal_postal_code: fiscalPostalCode,
    fiscal_country: fiscalCountry,
    is_company: isCompany,
    profile_type: isCompany === true ? "company" : "person",
  };
}

async function createCanonicalClientFromHoldedContact(args: {
  supabase: SupabaseLike;
  holdedContactId: string;
}): Promise<{ clientId: string | null; delegateId: string | null }> {
  const { supabase, holdedContactId } = args;

  const holdedContactRow = await loadHoldedContactSnapshot(
    supabase,
    holdedContactId
  );

  if (!holdedContactRow) {
    return { clientId: null, delegateId: null };
  }

  const payload = buildClientInsertFromHoldedContact(
    holdedContactId,
    holdedContactRow
  );

  const { data, error } = await supabase
    .from("clients")
    .insert(payload)
    .select("id, delegate_id")
    .maybeSingle();

  if (error) throw error;

  return {
    clientId: toNullableString(data?.id),
    delegateId: toNullableString(data?.delegate_id),
  };
}

async function ensureHoldedContactClientMapping(args: {
  supabase: SupabaseLike;
  holdedContactId: string;
  clientId: string;
}) {
  const { supabase, holdedContactId, clientId } = args;

  const { error } = await supabase
    .from("holded_contact_client_map_g1")
    .upsert(
      {
        holded_contact_id: holdedContactId,
        client_id: clientId,
      },
      {
        onConflict: "holded_contact_id",
      }
    );

  if (error) throw error;
}

async function findClientByHoldedContactId(
  supabase: SupabaseLike,
  holdedContactId: string
): Promise<ClientResolution | null> {
  const normalizedHoldedContactId = toNullableString(holdedContactId);
  if (!normalizedHoldedContactId) {
    return null;
  }

  let holdedContactRow = await loadHoldedContactSnapshot(
    supabase,
    normalizedHoldedContactId
  );

  if (!holdedContactRow) {
    const synced = await syncHoldedContactIntoLocalSnapshot({
      supabase,
      holdedContactId: normalizedHoldedContactId,
    });

    if (!synced) {
      return {
        holdedContactExists: false,
        clientId: null,
        delegateId: null,
        mappingExists: false,
        clientExists: false,
      };
    }

    holdedContactRow = await loadHoldedContactSnapshot(
      supabase,
      normalizedHoldedContactId
    );
  }

  if (!holdedContactRow) {
    return {
      holdedContactExists: false,
      clientId: null,
      delegateId: null,
      mappingExists: false,
      clientExists: false,
    };
  }

  const { data: mapRow, error: mapError } = await supabase
    .from("holded_contact_client_map_g1")
    .select("client_id")
    .eq("holded_contact_id", normalizedHoldedContactId)
    .maybeSingle();

  if (mapError) throw mapError;

  if (mapRow?.client_id) {
    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .select("id, delegate_id")
      .eq("id", mapRow.client_id)
      .maybeSingle();

    if (clientError) throw clientError;

    if (!clientRow?.id) {
      return {
        holdedContactExists: true,
        clientId: toNullableString(mapRow.client_id),
        delegateId: null,
        mappingExists: true,
        clientExists: false,
      };
    }

    return {
      holdedContactExists: true,
      clientId: toNullableString(clientRow.id),
      delegateId: toNullableString(clientRow.delegate_id),
      mappingExists: true,
      clientExists: true,
    };
  }

  const { data: candidateClients, error: candidateClientsError } = await supabase
    .from("clients")
    .select("id, delegate_id")
    .eq("holded_contact_id", normalizedHoldedContactId)
    .limit(2);

  if (candidateClientsError) throw candidateClientsError;

  const candidates = Array.isArray(candidateClients) ? candidateClients : [];

  if (candidates.length === 1 && candidates[0]?.id) {
    const resolvedClientId = toNullableString(candidates[0].id);
    const resolvedDelegateId = toNullableString(candidates[0].delegate_id);

    if (!resolvedClientId) {
      return {
        holdedContactExists: true,
        clientId: null,
        delegateId: null,
        mappingExists: false,
        clientExists: false,
      };
    }

    await ensureHoldedContactClientMapping({
      supabase,
      holdedContactId: normalizedHoldedContactId,
      clientId: resolvedClientId,
    });

    return {
      holdedContactExists: true,
      clientId: resolvedClientId,
      delegateId: resolvedDelegateId,
      mappingExists: true,
      clientExists: true,
    };
  }

  if (candidates.length > 1) {
    return {
      holdedContactExists: true,
      clientId: null,
      delegateId: null,
      mappingExists: false,
      clientExists: false,
    };
  }

  const created = await createCanonicalClientFromHoldedContact({
    supabase,
    holdedContactId: normalizedHoldedContactId,
  });

  if (!created.clientId) {
    return {
      holdedContactExists: true,
      clientId: null,
      delegateId: null,
      mappingExists: false,
      clientExists: false,
    };
  }

  await ensureHoldedContactClientMapping({
    supabase,
    holdedContactId: normalizedHoldedContactId,
    clientId: created.clientId,
  });

  return {
    holdedContactExists: true,
    clientId: created.clientId,
    delegateId: created.delegateId,
    mappingExists: true,
    clientExists: true,
  };
}

async function loadExistingInvoicesByExternalId(args: {
  supabase: SupabaseLike;
  externalInvoiceIds: string[];
}) {
  const ids = Array.from(
    new Set(
      (args.externalInvoiceIds ?? [])
        .map((x) => toNullableString(x))
        .filter((x): x is string => Boolean(x))
    )
  );

  if (ids.length === 0) {
    return new Map<string, any>();
  }

  const { data, error } = await args.supabase
    .from("invoices")
    .select(
      "id, external_invoice_id, source_provider, state_code, is_paid, paid_date, external_modified_at"
    )
    .eq("source_provider", "holded")
    .in("external_invoice_id", ids);

  if (error) throw error;

  const map = new Map<string, any>();

  for (const row of data ?? []) {
    const extId = toNullableString(row?.external_invoice_id);
    if (extId) {
      map.set(extId, row);
    }
  }

  return map;
}

async function updateExistingInvoiceFieldsIfNeeded(args: {
  supabase: SupabaseLike;
  invoiceId: string;
  currentStateCode: string | null;
  nextStateCode: string | null;
  currentIsPaid: boolean | null;
  nextIsPaid: boolean | null;
  currentPaidDate: string | null;
  nextPaidDate: string | null;
  currentExternalModifiedAt: string | null;
  nextExternalModifiedAt: string | null;
}) {
  const currentStateCode = normalizeInvoiceStateCode(args.currentStateCode);
  const nextStateCode = normalizeInvoiceStateCode(args.nextStateCode);

  const currentPaidDate = toNullableString(args.currentPaidDate);
  const nextPaidDate = toNullableString(args.nextPaidDate);

  const currentExternalModifiedAt = toNullableString(
    args.currentExternalModifiedAt
  );
  const nextExternalModifiedAt = toNullableString(args.nextExternalModifiedAt);

  const currentIsPaid =
    typeof args.currentIsPaid === "boolean" ? args.currentIsPaid : null;
  const nextIsPaid =
    typeof args.nextIsPaid === "boolean" ? args.nextIsPaid : null;

  if (!args.invoiceId) {
    return { updated: false };
  }

  const patch: Record<string, unknown> = {};
  let changed = false;

  if (nextStateCode !== currentStateCode) {
    patch.state_code = nextStateCode;
    changed = true;
  }

  if (nextIsPaid !== currentIsPaid) {
    patch.is_paid = nextIsPaid;
    changed = true;
  }

  if (nextPaidDate !== currentPaidDate) {
    patch.paid_date = nextPaidDate;
    changed = true;
  }

  if (nextExternalModifiedAt !== currentExternalModifiedAt) {
    patch.external_modified_at = nextExternalModifiedAt;
    changed = true;
  }

  if (!changed) {
    return { updated: false };
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await args.supabase
    .from("invoices")
    .update(patch)
    .eq("id", args.invoiceId);

  if (error) throw error;

  return { updated: true };
}

export async function resolveByHoldedContactIdFactory(supabase: SupabaseLike) {
  return async (holdedContactId: string) => {
    return findClientByHoldedContactId(supabase, holdedContactId);
  };
}

export async function importHoldedDocumentsIncremental(args: {
  supabase: SupabaseLike;
  docs: IncrementalDocInput[];
  preview?: boolean;
  logger?: Pick<Console, "info" | "warn" | "error">;
}) {
  const { supabase, docs, preview = false, logger = console } = args;

  const resolveByHoldedContactId = await resolveByHoldedContactIdFactory(
    supabase
  );

  const accepted: any[] = [];
  const skipped: any[] = [];

  for (const doc of docs) {
    const decision = await buildHoldedImportDecision({
      summary: doc.summary,
      detail: doc.detail,
      resolveByHoldedContactId,
    });

    if (decision.status === "skip") {
      skipped.push({
        external_invoice_id: decision.externalInvoiceId,
        invoice_number: decision.invoiceNumber,
        reason: decision.reason,
        diagnostics: decision.diagnostics,
      });

      logger.warn(
        `[HOLDED][SKIP] ${decision.reason} :: ${decision.externalInvoiceId ?? "NO_ID"} :: ${decision.invoiceNumber ?? "NO_NUMBER"}`
      );
      continue;
    }

    accepted.push(decision);
  }

  if (preview) {
    return {
      accepted,
      skipped,
      insertedInvoices: 0,
      insertedItems: 0,
      existingInvoices: 0,
      updatedInvoices: 0,
    };
  }

  if (accepted.length === 0) {
    return {
      accepted,
      skipped,
      insertedInvoices: 0,
      insertedItems: 0,
      existingInvoices: 0,
      updatedInvoices: 0,
    };
  }

  const normalizedAccepted = accepted.map((acceptedDoc: any) => {
    const rawItems: any[] = Array.isArray(acceptedDoc.items)
      ? acceptedDoc.items
      : [];
    const forceCreditNoteNegative = isCreditNoteDocument(acceptedDoc.invoice);

    const sanitizedItems = rawItems.map((rawItem: any) =>
      sanitizeItemRowForCurrentSchema(rawItem, { forceCreditNoteNegative })
    );

    const sanitizedInvoice = sanitizeInvoiceRowForCurrentSchema(
      acceptedDoc.invoice,
      sanitizedItems,
      { forceCreditNoteNegative }
    );

    return {
      ...acceptedDoc,
      sanitizedInvoice,
      sanitizedItems,
    };
  });

  const allInvoiceRows = normalizedAccepted.map(
    (x: any) => x.sanitizedInvoice
  );

  const existingInvoicesByExternalId = await loadExistingInvoicesByExternalId({
    supabase,
    externalInvoiceIds: allInvoiceRows.map(
      (row: any) => row.external_invoice_id
    ),
  });

  const invoiceRowsToInsert: any[] = [];
  const existingAcceptedDocs: any[] = [];
  let updatedInvoices = 0;

  for (const acceptedDoc of normalizedAccepted) {
    const sanitizedInvoice = acceptedDoc.sanitizedInvoice;
    const externalInvoiceId = toNullableString(
      sanitizedInvoice?.external_invoice_id
    );

    if (!externalInvoiceId) {
      invoiceRowsToInsert.push(sanitizedInvoice);
      continue;
    }

    const existingInvoice = existingInvoicesByExternalId.get(externalInvoiceId);

    if (!existingInvoice) {
      invoiceRowsToInsert.push(sanitizedInvoice);
      continue;
    }

    await updateExistingInvoiceFieldsIfNeeded({
      supabase,
      invoiceId: existingInvoice.id,
      currentStateCode: existingInvoice.state_code ?? null,
      nextStateCode: sanitizedInvoice.state_code ?? null,
      currentIsPaid:
        typeof existingInvoice.is_paid === "boolean"
          ? existingInvoice.is_paid
          : null,
      nextIsPaid:
        typeof sanitizedInvoice.is_paid === "boolean"
          ? sanitizedInvoice.is_paid
          : null,
      currentPaidDate: existingInvoice.paid_date ?? null,
      nextPaidDate: sanitizedInvoice.paid_date ?? null,
      currentExternalModifiedAt: existingInvoice.external_modified_at ?? null,
      nextExternalModifiedAt: sanitizedInvoice.external_modified_at ?? null,
    }).then((result) => {
      if (result.updated) {
        updatedInvoices += 1;
      }
    });

    existingAcceptedDocs.push({
      ...acceptedDoc,
      existingInvoiceId: existingInvoice.id,
    });
  }

  let insertedInvoices: any[] = [];

  if (invoiceRowsToInsert.length > 0) {
    const { data, error: insertInvoicesError } = await supabase
      .from("invoices")
      .insert(invoiceRowsToInsert)
      .select("id, external_invoice_id");

    if (insertInvoicesError) {
      throw insertInvoicesError;
    }

    insertedInvoices = data ?? [];
  }

  const invoiceIdByExternalId = new Map<string, string>();

  for (const row of insertedInvoices ?? []) {
    if (row?.external_invoice_id && row?.id) {
      invoiceIdByExternalId.set(row.external_invoice_id, row.id);
    }
  }

  const itemRows: any[] = [];

  for (const acceptedDoc of normalizedAccepted) {
    const externalInvoiceId = toNullableString(
      acceptedDoc?.sanitizedInvoice?.external_invoice_id
    );

    if (!externalInvoiceId) continue;

    const existingInvoice = existingInvoicesByExternalId.get(externalInvoiceId);
    if (existingInvoice?.id) {
      continue;
    }

    const invoiceId = invoiceIdByExternalId.get(externalInvoiceId) ?? null;
    if (!invoiceId) continue;

    const sanitizedItems: any[] = Array.isArray(acceptedDoc.sanitizedItems)
      ? acceptedDoc.sanitizedItems
      : [];

    for (const sanitizedItem of sanitizedItems) {
      itemRows.push({
        invoice_id: invoiceId,
        ...sanitizedItem,
      });
    }
  }

  if (itemRows.length > 0) {
    const { error: insertItemsError } = await supabase
      .from("invoice_items")
      .insert(itemRows);

    if (insertItemsError) {
      throw insertItemsError;
    }
  }

  logger.info(
    `[HOLDED][OK] inserted_invoices=${invoiceRowsToInsert.length} existing_invoices=${existingAcceptedDocs.length} updated_invoices=${updatedInvoices} items=${itemRows.length} skipped=${skipped.length}`
  );

  return {
    accepted,
    skipped,
    insertedInvoices: invoiceRowsToInsert.length,
    insertedItems: itemRows.length,
    existingInvoices: existingAcceptedDocs.length,
    updatedInvoices,
  };
}

export async function runHoldedInvoicesIncrementalImport(
  ...args: any[]
): Promise<any> {
  const first = args[0];

  if (first && typeof first === "object" && !Array.isArray(first)) {
    return importHoldedDocumentsIncremental({
      supabase: first.supabase,
      docs: Array.isArray(first.docs) ? first.docs : [],
      preview: Boolean(first.preview),
      logger: first.logger ?? console,
    });
  }

  return importHoldedDocumentsIncremental({
    supabase: args[0],
    docs: Array.isArray(args[1]) ? args[1] : [],
    preview: Boolean(args[2]),
    logger: args[3] ?? console,
  });
}