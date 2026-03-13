/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  holdedFetch as holdedDocumentDetail,
} from "./holdedFetch";

export type HoldedSummaryDoc = {
  id?: string;
  _id?: string;
  docType?: string | null;
  documentType?: string | null;
  type?: string | null;
  docNumber?: string | null;
  number?: string | null;
  date?: number | string | null;
  currency?: string | null;
  status?: string | number | null;
  draft?: boolean | null;
  contact?: any;
  contactId?: string | null;
  contact_id?: string | null;
  client?: any;
  customer?: any;
  [key: string]: unknown;
};

export type HoldedDetailDoc = Record<string, unknown>;

export type HoldedClientMatch = {
  clientId: string | null;
  delegateId: string | null;
  matchedBy: "holded_contact_id" | "name_fallback" | null;
};

export type HoldedContactLookup = (
  holdedContactId: string
) => Promise<{ clientId: string | null; delegateId: string | null } | null>;

export type HoldedNameLookup = (
  contactName: string
) => Promise<{ clientId: string | null; delegateId: string | null } | null>;

export type InvoiceLineType = "sale" | "promotion" | "neutral";

export type CanonicalInvoiceRow = {
  source_provider: "holded";
  external_invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  client_name: string | null;
  holded_contact_id: string | null;
  client_id: string | null;
  delegate_id: string | null;
  currency: string | null;
  source_meta: Record<string, unknown>;
};

export type CanonicalInvoiceItemRow = {
  source_provider: "holded";
  external_invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  position: number;
  sku: string | null;
  description: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  line_subtotal: number | null;
  line_type: InvoiceLineType;
  source_meta: Record<string, unknown>;
};

export type HoldedImportDecision =
  | {
      status: "skip";
      externalInvoiceId: string | null;
      invoiceNumber: string | null;
      reason:
        | "draft_missing_docnumber"
        | "draft_flag_true"
        | "draft_status"
        | "missing_external_invoice_id"
        | "missing_invoice_date"
        | "missing_identity_minimum"
        | "empty_lines";
      diagnostics: Record<string, unknown>;
    }
  | {
      status: "accept";
      externalInvoiceId: string;
      invoiceNumber: string;
      invoice: CanonicalInvoiceRow;
      items: CanonicalInvoiceItemRow[];
      diagnostics: Record<string, unknown>;
    };

export type ImportError = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  externalInvoiceId?: string | null;
  invoiceNumber?: string | null;
};

type SupabaseLike = {
  from: (table: string) => any;
};

const SALE_SKUS = new Set<string>(["VIHO-OBE-SPRAY-002"]);

const PROMO_SKUS = new Set<string>([
  "VIHO-OBE-PROMO-001",
  "VIHO-OBE-PROMO-002",
  "VIHO-OBE-PROMO-003",
  "VIHO-OBE-PROMO-CP-12M",
  "VIHO-OBE-PROMO-PLUS-4M",
]);

const NEUTRAL_SKUS = new Set<string>(["VIHO-BOOK-BASCULA"]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.trim()) set.add(v.trim());
  }
  return [...set];
}

function pickFirstString(...values: unknown[]): string | null {
  for (const v of values) {
    const s = asString(v);
    if (s) return s;
  }
  return null;
}

function unixToDateYmd(unixOrString: unknown): string | null {
  if (typeof unixOrString === "number" && Number.isFinite(unixOrString)) {
    const ms = unixOrString > 9999999999 ? unixOrString : unixOrString * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof unixOrString === "string" && unixOrString.trim()) {
    const raw = unixOrString.trim();
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return unixToDateYmd(n);
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

function normalizeSku(v: unknown): string | null {
  const s = asString(v);
  return s ? s.trim().toUpperCase() : null;
}

function classifyLineTypeBySku(sku: string | null): InvoiceLineType {
  if (!sku) return "neutral";
  if (SALE_SKUS.has(sku)) return "sale";
  if (PROMO_SKUS.has(sku)) return "promotion";
  if (NEUTRAL_SKUS.has(sku)) return "neutral";
  return "neutral";
}

function buildSafeSummaryFromDetail(detail: HoldedDetailDoc): HoldedSummaryDoc {
  const detailContact = asRecord(detail["contact"]);
  const detailClient = asRecord(detail["client"]);
  const detailCustomer = asRecord(detail["customer"]);

  return {
    id: asString(detail["id"]) ?? undefined,
    _id: asString(detail["_id"]) ?? undefined,
    docType: asString(detail["docType"]),
    documentType: asString(detail["documentType"]),
    type: asString(detail["type"]),
    docNumber: asString(detail["docNumber"]),
    number: asString(detail["number"]),
    date: (detail["date"] as number | string | null | undefined) ?? null,
    currency: asString(detail["currency"]),
    status:
      (typeof detail["status"] === "string" || typeof detail["status"] === "number"
        ? (detail["status"] as string | number)
        : null),
    draft: detail["draft"] === true,
    contact:
      detailContact ??
      (typeof detail["contact"] === "string" ? detail["contact"] : undefined),
    contactId: asString(detail["contactId"]),
    contact_id: asString(detail["contact_id"]),
    client: detailClient ?? undefined,
    customer: detailCustomer ?? undefined,
  };
}

function isLikelyDraft(summary: HoldedSummaryDoc, detail: HoldedDetailDoc): {
  isDraft: boolean;
  reason: "draft_missing_docnumber" | "draft_flag_true" | "draft_status" | null;
} {
  const invoiceNumber = pickFirstString(
    summary.docNumber,
    summary.number,
    detail["docNumber"],
    detail["number"]
  );

  if (!invoiceNumber?.trim()) {
    return { isDraft: true, reason: "draft_missing_docnumber" };
  }

  const summaryDraft = summary.draft === true;
  const detailDraft = detail["draft"] === true;

  if (summaryDraft || detailDraft) {
    return { isDraft: true, reason: "draft_flag_true" };
  }

  const statuses = uniqueStrings([
    asString(summary.status),
    asString(detail["status"]),
    asString(detail["docStatus"]),
    asString(detail["documentStatus"]),
  ]).map((s) => s.toLowerCase());

  if (
    statuses.some(
      (s) =>
        s === "draft" ||
        s === "borrador" ||
        s === "pending_draft" ||
        s === "temporary_draft"
    )
  ) {
    return { isDraft: true, reason: "draft_status" };
  }

  return { isDraft: false, reason: null };
}

export function extractHoldedContactIdentity(detail: HoldedDetailDoc): {
  holdedContactId: string | null;
  contactName: string | null;
  extractionSource: string | null;
} {
  const detailContact = asRecord(detail["contact"]);
  const detailClient = asRecord(detail["client"]);
  const detailCustomer = asRecord(detail["customer"]);

  const idCandidates: Array<{ value: string | null; source: string }> = [
    { value: asString(detailContact?.["id"]), source: "detail.contact.id" },
    { value: asString(detailContact?.["_id"]), source: "detail.contact._id" },
    { value: asString(detail["contactId"]), source: "detail.contactId" },
    { value: asString(detail["contact_id"]), source: "detail.contact_id" },
    { value: asString(detailClient?.["id"]), source: "detail.client.id" },
    { value: asString(detailClient?.["_id"]), source: "detail.client._id" },
    { value: asString(detailCustomer?.["id"]), source: "detail.customer.id" },
    { value: asString(detailCustomer?.["_id"]), source: "detail.customer._id" },
    {
      value:
        typeof detail["contact"] === "string" ? asString(detail["contact"]) : null,
      source: "detail.contact(string)",
    },
  ];

  let holdedContactId: string | null = null;
  let extractionSource: string | null = null;

  for (const candidate of idCandidates) {
    if (candidate.value) {
      holdedContactId = candidate.value;
      extractionSource = candidate.source;
      break;
    }
  }

  const contactName = pickFirstString(
    detailContact?.["name"],
    detailClient?.["name"],
    detailCustomer?.["name"],
    detail["contactName"],
    detail["clientName"],
    detail["customerName"],
    detail["name"]
  );

  return {
    holdedContactId,
    contactName,
    extractionSource,
  };
}

function extractExternalInvoiceId(
  summary: HoldedSummaryDoc,
  detail: HoldedDetailDoc
): string | null {
  return pickFirstString(
    summary.id,
    summary._id,
    detail["id"],
    detail["_id"],
    detail["docId"],
    detail["documentId"]
  );
}

function extractInvoiceNumber(
  summary: HoldedSummaryDoc,
  detail: HoldedDetailDoc
): string | null {
  return pickFirstString(
    summary.docNumber,
    summary.number,
    detail["docNumber"],
    detail["number"]
  );
}

function extractClientName(
  summary: HoldedSummaryDoc,
  detail: HoldedDetailDoc,
  contactName: string | null
): string | null {
  const summaryContact = asRecord(summary.contact);
  const summaryClient = asRecord(summary.client);
  const summaryCustomer = asRecord(summary.customer);

  return pickFirstString(
    contactName,
    summaryContact?.["name"],
    summaryClient?.["name"],
    summaryCustomer?.["name"],
    summary["contactName"],
    summary["clientName"],
    summary["customerName"],
    detail["contactName"],
    detail["clientName"],
    detail["customerName"]
  );
}

function extractCurrency(
  summary: HoldedSummaryDoc,
  detail: HoldedDetailDoc
): string | null {
  return pickFirstString(summary.currency, detail["currency"]);
}

function extractLines(detail: HoldedDetailDoc): any[] {
  const direct = detail["products"];
  if (Array.isArray(direct)) return direct;

  const lines = detail["lines"];
  if (Array.isArray(lines)) return lines;

  const items = detail["items"];
  if (Array.isArray(items)) return items;

  return [];
}

function normalizeLine(
  line: any,
  position: number,
  header: {
    externalInvoiceId: string;
    invoiceNumber: string;
    invoiceDate: string;
  }
): CanonicalInvoiceItemRow {
  const sku = normalizeSku(
    line?.sku ??
      line?.reference ??
      line?.productSku ??
      line?.product_sku ??
      line?.code
  );

  const description = pickFirstString(
    line?.name,
    line?.description,
    line?.desc,
    line?.title
  );

  const quantity = asNumber(line?.units ?? line?.quantity ?? line?.qty) ?? 0;
  const unitPrice = asNumber(
    line?.price ?? line?.unitPrice ?? line?.unit_price ?? line?.subtotal
  );

  const discountPercent = asNumber(
    line?.discount ?? line?.discountPercent ?? line?.discount_percent
  );

  let subtotal =
    asNumber(line?.subtotal ?? line?.subTotal ?? line?.total ?? line?.amount) ??
    null;

  if (subtotal === null && unitPrice !== null) {
    subtotal = quantity * unitPrice;
    if (discountPercent !== null) {
      subtotal = subtotal * (1 - discountPercent / 100);
    }
  }

  const lineType = classifyLineTypeBySku(sku);

  return {
    source_provider: "holded",
    external_invoice_id: header.externalInvoiceId,
    invoice_number: header.invoiceNumber,
    invoice_date: header.invoiceDate,
    position,
    sku,
    description,
    quantity,
    unit_price: unitPrice,
    discount_percent: discountPercent,
    line_subtotal: subtotal,
    line_type: lineType,
    source_meta: {
      source: "holded",
      position,
      raw_keys: Object.keys(asRecord(line) ?? {}),
    },
  };
}

function buildSourceMeta(params: {
  summary: HoldedSummaryDoc;
  detail: HoldedDetailDoc;
  externalInvoiceId: string;
  invoiceNumber: string;
  currency: string | null;
  holdedContactId: string | null;
  contactName: string | null;
  extractionSource: string | null;
  fallbackMatchByName: boolean;
  summarySource: "list" | "detail_fallback";
}): Record<string, unknown> {
  const { summary, detail } = params;

  return {
    provider: "holded",
    holded_id: params.externalInvoiceId,
    holded_doc_type: pickFirstString(
      summary.docType,
      summary.documentType,
      summary.type,
      detail["docType"],
      detail["documentType"],
      detail["type"]
    ),
    holded_docNumber: params.invoiceNumber,
    holded_date_unix: asNumber(
      summary.date ?? detail["date"] ?? detail["createdAt"]
    ),
    holded_currency_raw: params.currency,
    holded_contact_id_candidate: params.holdedContactId,
    holded_contact_name_candidate: params.contactName,
    holded_contact_extraction_source: params.extractionSource,
    holded_detail_keys: Object.keys(detail),
    fallback_match_by_name: params.fallbackMatchByName,
    raw_summary_keys: Object.keys(summary),
    summary_source: params.summarySource,
  };
}

export async function resolveClientForHoldedDocument(args: {
  holdedContactId: string | null;
  contactName: string | null;
  resolveByHoldedContactId?: HoldedContactLookup;
  resolveByContactNamePreviewOnly?: HoldedNameLookup;
  enableNameFallbackInPreview?: boolean;
}): Promise<HoldedClientMatch> {
  const {
    holdedContactId,
    contactName,
    resolveByHoldedContactId,
    resolveByContactNamePreviewOnly,
    enableNameFallbackInPreview,
  } = args;

  if (holdedContactId && resolveByHoldedContactId) {
    const found = await resolveByHoldedContactId(holdedContactId);
    if (found?.clientId) {
      return {
        clientId: found.clientId,
        delegateId: found.delegateId,
        matchedBy: "holded_contact_id",
      };
    }
  }

  if (
    enableNameFallbackInPreview &&
    contactName &&
    resolveByContactNamePreviewOnly
  ) {
    const found = await resolveByContactNamePreviewOnly(contactName);
    if (found?.clientId) {
      return {
        clientId: found.clientId,
        delegateId: found.delegateId,
        matchedBy: "name_fallback",
      };
    }
  }

  return {
    clientId: null,
    delegateId: null,
    matchedBy: null,
  };
}

export async function buildHoldedImportDecision(args: {
  summary: HoldedSummaryDoc;
  detail: HoldedDetailDoc;
  resolveByHoldedContactId?: HoldedContactLookup;
  resolveByContactNamePreviewOnly?: HoldedNameLookup;
  enableNameFallbackInPreview?: boolean;
  summarySource?: "list" | "detail_fallback";
}): Promise<HoldedImportDecision> {
  const { summary, detail } = args;
  const summarySource = args.summarySource ?? "list";

  const externalInvoiceId = extractExternalInvoiceId(summary, detail);
  if (!externalInvoiceId) {
    return {
      status: "skip",
      externalInvoiceId: null,
      invoiceNumber: null,
      reason: "missing_external_invoice_id",
      diagnostics: {
        summary_keys: Object.keys(summary),
        detail_keys: Object.keys(detail),
        summary_source: summarySource,
      },
    };
  }

  const invoiceNumber = extractInvoiceNumber(summary, detail);

  const draftCheck = isLikelyDraft(summary, detail);
  if (draftCheck.isDraft) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: draftCheck.reason!,
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number_candidate: invoiceNumber,
        summary_source: summarySource,
        summary_docNumber: summary.docNumber ?? null,
        summary_number: summary.number ?? null,
        summary_draft: summary.draft ?? null,
        summary_status: summary.status ?? null,
        detail_docNumber: asString(detail["docNumber"]),
        detail_number: asString(detail["number"]),
        detail_draft: detail["draft"] === true,
        detail_status: asString(detail["status"]),
      },
    };
  }

  const invoiceDate = unixToDateYmd(
    summary.date ?? detail["date"] ?? detail["createdAt"]
  );
  if (!invoiceDate) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "missing_invoice_date",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number_candidate: invoiceNumber,
        raw_date: summary.date ?? detail["date"] ?? detail["createdAt"],
        summary_source: summarySource,
      },
    };
  }

  if (!invoiceNumber?.trim()) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "missing_identity_minimum",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        message: "invoice_number empty after normalization",
        summary_source: summarySource,
      },
    };
  }

  const { holdedContactId, contactName, extractionSource } =
    extractHoldedContactIdentity(detail);

  const clientMatch = await resolveClientForHoldedDocument({
    holdedContactId,
    contactName,
    resolveByHoldedContactId: args.resolveByHoldedContactId,
    resolveByContactNamePreviewOnly: args.resolveByContactNamePreviewOnly,
    enableNameFallbackInPreview: args.enableNameFallbackInPreview,
  });

  const currency = extractCurrency(summary, detail);
  const clientName = extractClientName(summary, detail, contactName);

  const sourceMeta = buildSourceMeta({
    summary,
    detail,
    externalInvoiceId,
    invoiceNumber,
    currency,
    holdedContactId,
    contactName: clientName,
    extractionSource,
    fallbackMatchByName: clientMatch.matchedBy === "name_fallback",
    summarySource,
  });

  const rawLines = extractLines(detail);
  const items = rawLines.map((line, index) =>
    normalizeLine(line, index + 1, {
      externalInvoiceId,
      invoiceNumber,
      invoiceDate,
    })
  );

  if (items.length === 0) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "empty_lines",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number: invoiceNumber,
        summary_source: summarySource,
      },
    };
  }

  const hasMinimumIdentity = !!externalInvoiceId && !!invoiceNumber && !!invoiceDate;
  if (!hasMinimumIdentity) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "missing_identity_minimum",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        summary_source: summarySource,
      },
    };
  }

  const invoice: CanonicalInvoiceRow = {
    source_provider: "holded",
    external_invoice_id: externalInvoiceId,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    client_name: clientName,
    holded_contact_id: holdedContactId,
    client_id: clientMatch.clientId,
    delegate_id: clientMatch.delegateId,
    currency,
    source_meta: {
      ...sourceMeta,
      g1_strict_disabled: true,
      requires_holded_contact_client_map_g1: false,
      auto_create_holded_contact_client_map_g1: false,
      missing_client_mapping_soft: !!holdedContactId && !clientMatch.clientId,
      missing_holded_contact_identity_soft: !holdedContactId,
    },
  };

  return {
    status: "accept",
    externalInvoiceId,
    invoiceNumber,
    invoice,
    items,
    diagnostics: {
      matched_by: clientMatch.matchedBy,
      client_id_preview: clientMatch.clientId,
      delegate_id_preview: clientMatch.delegateId,
      holded_contact_id: holdedContactId,
      client_name: clientName,
      source_meta_ok: Object.keys(sourceMeta).length > 0,
      summary_source: summarySource,
      g1_strict_disabled: true,
      requires_holded_contact_client_map_g1: false,
      auto_create_holded_contact_client_map_g1: false,
      missing_client_mapping_soft: !!holdedContactId && !clientMatch.clientId,
      missing_holded_contact_identity_soft: !holdedContactId,
    },
  };
}

async function resolveByHoldedContactIdFromSupabase(
  supabase: SupabaseLike,
  holdedContactId: string
): Promise<{ clientId: string | null; delegateId: string | null } | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, delegate_id, holded_contact_id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return {
    clientId: data.id ?? null,
    delegateId: data.delegate_id ?? null,
  };
}

async function resolveByContactNamePreviewFromSupabase(
  supabase: SupabaseLike,
  contactName: string
): Promise<{ clientId: string | null; delegateId: string | null } | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, delegate_id, name")
    .ilike("name", contactName)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    clientId: data.id ?? null,
    delegateId: data.delegate_id ?? null,
  };
}

function inferIsCompany(name: string | null): boolean | null {
  if (!name) return null;

  const upper = name.toUpperCase();

  if (
    upper.includes(" S.L.") ||
    upper.includes(" SL ") ||
    upper.endsWith(" SL") ||
    upper.includes(" S.A.") ||
    upper.endsWith(" SA") ||
    upper.includes(" S.C.P.") ||
    upper.endsWith(" SCP") ||
    upper.includes(" SLL") ||
    upper.includes(" S.L.L.") ||
    upper.includes(" S.COOP.") ||
    upper.includes(" COOP")
  ) {
    return true;
  }

  return null;
}

async function createClientInClientsOnly(args: {
  supabase: SupabaseLike;
  holdedContactId: string;
  clientName: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
}): Promise<{ clientId: string | null; delegateId: string | null } | null> {
  const { supabase, holdedContactId, clientName, logger = console } = args;

  const existing = await resolveByHoldedContactIdFromSupabase(
    supabase,
    holdedContactId
  );

  if (existing?.clientId) {
    return existing;
  }

  const isCompany = inferIsCompany(clientName);

  const clientInsertPayload = {
    name: clientName,
    name_raw: clientName,
    legal_name: clientName,
    holded_contact_id: holdedContactId,
    status: "active",
    state_code: "ACTIVE",
    is_company: isCompany,
    updated_at: new Date().toISOString(),
  };

  const { data: insertedClient, error: insertClientError } = await supabase
    .from("clients")
    .insert(clientInsertPayload)
    .select("id, delegate_id")
    .single();

  if (insertClientError) throw insertClientError;

  logger.info(
    `[HOLDED][CLIENT_CREATED][ONE] ${clientName} :: ${holdedContactId} :: ${insertedClient.id}`
  );

  return {
    clientId: insertedClient.id ?? null,
    delegateId: insertedClient.delegate_id ?? null,
  };
}

async function ensureAcceptedDecisionHasClient(args: {
  supabase: SupabaseLike;
  decision: Extract<HoldedImportDecision, { status: "accept" }>;
  logger?: Pick<Console, "info" | "warn" | "error">;
}): Promise<Extract<HoldedImportDecision, { status: "accept" }>> {
  const { supabase, decision, logger = console } = args;

  if (decision.invoice.client_id) {
    return decision;
  }

  const holdedContactId = decision.invoice.holded_contact_id;
  const clientName = decision.invoice.client_name;

  if (!holdedContactId || !clientName) {
    return decision;
  }

  const resolution = await createClientInClientsOnly({
    supabase,
    holdedContactId,
    clientName,
    logger,
  });

  if (!resolution?.clientId) {
    return decision;
  }

  return {
    ...decision,
    invoice: {
      ...decision.invoice,
      client_id: resolution.clientId,
      delegate_id: resolution.delegateId,
    },
    diagnostics: {
      ...(decision.diagnostics ?? {}),
      auto_created_client_from_holded: true,
      client_id_preview: resolution.clientId,
      delegate_id_preview: resolution.delegateId,
      missing_client_mapping_soft: false,
    },
  };
}

async function getExistingHoldedInvoice(args: {
  supabase: SupabaseLike;
  externalInvoiceId: string;
}) {
  const { supabase, externalInvoiceId } = args;

  const { data, error } = await supabase
    .from("invoices")
    .select("id, state_code, external_invoice_id, source_provider")
    .eq("source_provider", "holded")
    .eq("external_invoice_id", externalInvoiceId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function updateOnlyInvoiceState(args: {
  supabase: SupabaseLike;
  externalInvoiceId: string;
  nextStateCode: string;
}) {
  const { supabase, externalInvoiceId, nextStateCode } = args;

  const { error } = await supabase
    .from("invoices")
    .update({
      state_code: nextStateCode,
      updated_at: new Date().toISOString(),
    })
    .eq("source_provider", "holded")
    .eq("external_invoice_id", externalInvoiceId);

  if (error) throw error;
}

function extractDesiredStateCode(
  detail: HoldedDetailDoc,
  summary: HoldedSummaryDoc
): string {
  const raw =
    pickFirstString(
      detail["status"],
      detail["docStatus"],
      detail["documentStatus"],
      summary.status
    ) ?? "OPEN";

  const value = raw.trim().toLowerCase();

  if (value === "paid" || value === "pagado" || value === "cobrado") return "PAID";
  if (value === "pending" || value === "pendiente") return "PENDING";
  if (value === "overdue" || value === "vencido") return "OVERDUE";
  if (value === "cancelled" || value === "canceled" || value === "anulado")
    return "CANCELLED";

  return "OPEN";
}

function normalizeDocType(raw: unknown): string {
  if (typeof raw !== "string") return "invoice";
  const v = raw.trim().toLowerCase();

  if (
    v.includes("credit") ||
    v.includes("refund") ||
    v.includes("abon") ||
    v.includes("rectific")
  ) {
    return "creditnote";
  }

  return "invoice";
}

function parseImportOneArgs(args: any[]): {
  supabase: SupabaseLike;
  externalInvoiceId: string;
  docType: string;
  preview: boolean;
  logger: Pick<Console, "info" | "warn" | "error">;
  summary?: HoldedSummaryDoc | null;
} {
  const first = args[0];

  if (first && typeof first === "object" && !Array.isArray(first)) {
    return {
      supabase: first.supabase as SupabaseLike,
      externalInvoiceId:
        String(
          first.externalInvoiceId ??
            first.invoiceId ??
            first.holdedId ??
            first.id ??
            ""
        ).trim(),
      docType: normalizeDocType(first.docType ?? first.type),
      preview: Boolean(first.preview),
      logger: (first.logger ?? console) as Pick<Console, "info" | "warn" | "error">,
      summary: (first.summary ?? null) as HoldedSummaryDoc | null,
    };
  }

  return {
    supabase: args[0] as SupabaseLike,
    externalInvoiceId: String(args[1] ?? "").trim(),
    docType: normalizeDocType(args[2]),
    preview: Boolean(args[3]),
    logger: (args[4] ?? console) as Pick<Console, "info" | "warn" | "error">,
    summary: (args[5] ?? null) as HoldedSummaryDoc | null,
  };
}

export async function importOneHoldedInvoiceById(...args: any[]): Promise<{
  ok: boolean;
  status: "accepted" | "skipped" | "error";
  invoice?: CanonicalInvoiceRow;
  items?: CanonicalInvoiceItemRow[];
  decision?: HoldedImportDecision;
  error?: ImportError | null;
}> {
  try {
    const parsed = parseImportOneArgs(args);

    if (!parsed.supabase) {
      return {
        ok: false,
        status: "error",
        error: {
          code: "missing_supabase",
          message: "Supabase client is required",
        },
      };
    }

    if (!parsed.externalInvoiceId) {
      return {
        ok: false,
        status: "error",
        error: {
          code: "missing_external_invoice_id",
          message: "externalInvoiceId is required",
        },
      };
    }

    const detail = await (holdedDocumentDetail as any)(
      parsed.docType,
      parsed.externalInvoiceId
    );

    const hasRealSummary =
      parsed.summary !== null &&
      parsed.summary !== undefined &&
      typeof parsed.summary === "object" &&
      !Array.isArray(parsed.summary);

    const summary = hasRealSummary
      ? (parsed.summary as HoldedSummaryDoc)
      : buildSafeSummaryFromDetail(detail as HoldedDetailDoc);

    const decision = await buildHoldedImportDecision({
      summary,
      detail,
      resolveByHoldedContactId: async (holdedContactId: string) =>
        resolveByHoldedContactIdFromSupabase(parsed.supabase, holdedContactId),
      resolveByContactNamePreviewOnly: async (contactName: string) =>
        resolveByContactNamePreviewFromSupabase(parsed.supabase, contactName),
      enableNameFallbackInPreview: parsed.preview,
      summarySource: hasRealSummary ? "list" : "detail_fallback",
    });

    if (decision.status === "skip") {
      parsed.logger.warn(
        `[HOLDED][ONE][SKIP] ${decision.reason} :: ${decision.externalInvoiceId ?? "NO_ID"} :: ${decision.invoiceNumber ?? "NO_NUMBER"}`
      );

      return {
        ok: true,
        status: "skipped",
        decision,
        error: null,
      };
    }

    let acceptedDecision: Extract<HoldedImportDecision, { status: "accept" }> =
      decision;

    if (!parsed.preview) {
      acceptedDecision = await ensureAcceptedDecisionHasClient({
        supabase: parsed.supabase,
        decision: acceptedDecision,
        logger: parsed.logger,
      });
    }

    if (!parsed.preview) {
      const existingInvoice = await getExistingHoldedInvoice({
        supabase: parsed.supabase,
        externalInvoiceId: acceptedDecision.invoice.external_invoice_id,
      });

      if (existingInvoice) {
        const nextStateCode = extractDesiredStateCode(
          detail as HoldedDetailDoc,
          summary
        );

        const currentStateCode =
          typeof existingInvoice.state_code === "string"
            ? existingInvoice.state_code
            : "OPEN";

        if (nextStateCode !== currentStateCode) {
          await updateOnlyInvoiceState({
            supabase: parsed.supabase,
            externalInvoiceId: acceptedDecision.invoice.external_invoice_id,
            nextStateCode,
          });

          parsed.logger.info(
            `[HOLDED][ONE][STATE_UPDATED] ${acceptedDecision.invoice.invoice_number} :: ${acceptedDecision.invoice.external_invoice_id} :: ${currentStateCode} -> ${nextStateCode}`
          );
        } else {
          parsed.logger.info(
            `[HOLDED][ONE][NOOP] ${acceptedDecision.invoice.invoice_number} :: ${acceptedDecision.invoice.external_invoice_id}`
          );
        }

        return {
          ok: true,
          status: "accepted",
          invoice: acceptedDecision.invoice,
          items: acceptedDecision.items,
          decision: acceptedDecision,
          error: null,
        };
      }

      const { error: insertInvoiceError } = await parsed.supabase
        .from("invoices")
        .insert([acceptedDecision.invoice]);

      if (insertInvoiceError) throw insertInvoiceError;

      const { error: deleteItemsError } = await parsed.supabase
        .from("invoice_items")
        .delete()
        .eq("source_provider", "holded")
        .eq("external_invoice_id", acceptedDecision.invoice.external_invoice_id);

      if (deleteItemsError) throw deleteItemsError;

      const { error: insertItemsError } = await parsed.supabase
        .from("invoice_items")
        .insert(acceptedDecision.items);

      if (insertItemsError) throw insertItemsError;
    }

    parsed.logger.info(
      `[HOLDED][ONE][OK] ${acceptedDecision.invoice.invoice_number} :: ${acceptedDecision.invoice.external_invoice_id}`
    );

    return {
      ok: true,
      status: "accepted",
      invoice: acceptedDecision.invoice,
      items: acceptedDecision.items,
      decision: acceptedDecision,
      error: null,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: "error",
      error: {
        code: "import_one_failed",
        message: err?.message ?? "Unknown import error",
        details:
          err && typeof err === "object"
            ? { name: err.name ?? null }
            : null,
      },
    };
  }
}