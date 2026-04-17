/* eslint-disable @typescript-eslint/no-explicit-any */

import { holdedFetch } from "./holdedFetch";
import { computeCanonicalPaidState } from "./holdedPaidState";
import { getHoldedContactById } from "./getHoldedContactById";
import {
  asString,
  asNumber,
  asRecord,
  unixToDateYmd,
} from "./holdedPrimitives";
import { classifyLineTypeBySku } from "./holdedLineClassifier";

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
  matchedBy: "holded_contact_map_g1" | null;
};

export type HoldedContactLookup = (
  holdedContactId: string
) => Promise<
  | {
      holdedContactExists: boolean;
      clientId: string | null;
      delegateId: string | null;
      mappingExists: boolean;
      clientExists: boolean;
      autoCreatedClient?: boolean;
      autoCreatedMapping?: boolean;
    }
  | null
>;

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
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  is_paid: boolean | null;
  paid_date: string | null;
  document_type: "invoice" | "creditnote";
  state_code: string | null;
  external_modified_at: string | null;
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
        | "missing_holded_contact_identity"
        | "invalid_holded_contact"
        | "missing_holded_contact_client_mapping"
        | "mapped_client_not_found"
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.trim()) {
      set.add(v.trim());
    }
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

function normalizeSku(v: unknown): string | null {
  const s = asString(v);
  return s ? s.trim().toUpperCase() : null;
}

function buildSafeSummaryFromDetail(detail: HoldedDetailDoc): HoldedSummaryDoc {
  const detailContactRaw = detail["contact"];
  const detailContactRecord = asRecord(detailContactRaw);
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
      typeof detail["status"] === "string" || typeof detail["status"] === "number"
        ? (detail["status"] as string | number)
        : null,
    draft: detail["draft"] === true,
    contact: detailContactRecord ?? detailContactRaw ?? undefined,
    contactId: asString(detail["contactId"]),
    contact_id: asString(detail["contact_id"]),
    client: detailClient ?? undefined,
    customer: detailCustomer ?? undefined,
  };
}

function isLikelyDraft(
  summary: HoldedSummaryDoc,
  detail: HoldedDetailDoc
): {
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

export function extractHoldedContactIdentity(args: {
  summary: HoldedSummaryDoc;
  detail: HoldedDetailDoc;
}): {
  holdedContactId: string | null;
  contactName: string | null;
  extractionSource: string | null;
} {
  const { summary, detail } = args;

  const detailContact = asRecord(detail["contact"]);
  const detailClient = asRecord(detail["client"]);
  const detailCustomer = asRecord(detail["customer"]);

  const summaryContact = asRecord(summary.contact);
  const summaryClient = asRecord(summary.client);
  const summaryCustomer = asRecord(summary.customer);

  const idCandidates: Array<{ value: string | null; source: string }> = [
    { value: asString(detail["contact"]), source: "detail.contact" },
    { value: asString(detailContact?.["id"]), source: "detail.contact.id" },
    { value: asString(detailContact?.["_id"]), source: "detail.contact._id" },
    { value: asString(detail["contactId"]), source: "detail.contactId" },
    { value: asString(detail["contact_id"]), source: "detail.contact_id" },

    { value: asString(detailClient?.["id"]), source: "detail.client.id" },
    { value: asString(detailClient?.["_id"]), source: "detail.client._id" },
    { value: asString(detail["clientId"]), source: "detail.clientId" },
    { value: asString(detail["client_id"]), source: "detail.client_id" },

    { value: asString(detailCustomer?.["id"]), source: "detail.customer.id" },
    { value: asString(detailCustomer?.["_id"]), source: "detail.customer._id" },
    { value: asString(detail["customerId"]), source: "detail.customerId" },
    { value: asString(detail["customer_id"]), source: "detail.customer_id" },

    { value: asString(summary.contact), source: "summary.contact" },
    { value: asString(summaryContact?.["id"]), source: "summary.contact.id" },
    { value: asString(summaryContact?.["_id"]), source: "summary.contact._id" },
    { value: asString(summary.contactId), source: "summary.contactId" },
    { value: asString(summary.contact_id), source: "summary.contact_id" },

    { value: asString(summaryClient?.["id"]), source: "summary.client.id" },
    { value: asString(summaryClient?.["_id"]), source: "summary.client._id" },

    { value: asString(summaryCustomer?.["id"]), source: "summary.customer.id" },
    { value: asString(summaryCustomer?.["_id"]), source: "summary.customer._id" },
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
    detail["contactName"],
    detailClient?.["name"],
    detail["clientName"],
    detailCustomer?.["name"],
    detail["customerName"],
    summaryContact?.["name"],
    summary["contactName"],
    summaryClient?.["name"],
    summary["clientName"],
    summaryCustomer?.["name"],
    summary["customerName"],
    detail["name"],
    summary["name"]
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

  return pickFirstString(
    contactName,
    summaryContact?.["name"],
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

function normalizeExplicitHoldedStatus(
  detail: HoldedDetailDoc,
  summary: HoldedSummaryDoc
): string | null {
  const raw =
    pickFirstString(
      detail["status"],
      detail["docStatus"],
      detail["documentStatus"],
      summary.status
    ) ?? null;

  if (!raw) return null;

  const value = raw.trim().toLowerCase();

  if (value === "paid" || value === "pagado" || value === "cobrado") {
    return "SETTLED";
  }

  if (value === "pending" || value === "pendiente") {
    return "OPEN";
  }

  if (value === "overdue" || value === "vencido") {
    return "OPEN";
  }

  if (value === "cancelled" || value === "canceled" || value === "anulado") {
    return "INVALID";
  }

  return null;
}

function extractDueDate(detail: HoldedDetailDoc): string | null {
  const multipleDueDate = asRecord(detail["multipledueDate"]);
  const multipleDueDateAlt = asRecord(detail["multipleDueDate"]);

  return (
    unixToDateYmd(detail["dueDate"]) ??
    unixToDateYmd(multipleDueDate?.["date"]) ??
    unixToDateYmd(multipleDueDateAlt?.["date"]) ??
    unixToDateYmd(detail["forecastDate"])
  );
}

function extractExternalModifiedAt(
  summary: HoldedSummaryDoc,
  detail: HoldedDetailDoc
): string | null {
  return (
    unixToDateYmd(detail["updatedAt"]) ??
    unixToDateYmd(detail["modifiedAt"]) ??
    unixToDateYmd(detail["lastUpdate"]) ??
    unixToDateYmd(summary["updatedAt"]) ??
    unixToDateYmd(summary["modifiedAt"]) ??
    null
  );
}

function computeDesiredStateCode(args: {
  detail: HoldedDetailDoc;
  summary: HoldedSummaryDoc;
  paidState: {
    is_paid: boolean | null;
    reason: string;
  };
  paymentsPending: number | null;
}): string {
  const explicit = normalizeExplicitHoldedStatus(args.detail, args.summary);

  if (explicit === "INVALID") {
    return "INVALID";
  }

  if (args.paidState.is_paid === true || explicit === "SETTLED") {
    return "SETTLED";
  }

  return "OPEN";
}

function extractTotals(detail: HoldedDetailDoc): {
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
} {
  const totalGross =
    asNumber(detail["total"]) ??
    asNumber(detail["gross"]) ??
    asNumber(detail["totalGross"]);

  const totalNet =
    asNumber(detail["subtotal"]) ??
    asNumber(detail["net"]) ??
    asNumber(detail["totalNet"]);

  const totalVat =
    asNumber(detail["tax"]) ??
    asNumber(detail["vat"]) ??
    asNumber(detail["totalVat"]);

  return {
    total_net: totalNet,
    total_vat: totalVat,
    total_gross:
      totalGross ??
      (totalNet !== null && totalVat !== null ? totalNet + totalVat : null),
  };
}

function extractPayments(detail: HoldedDetailDoc): {
  payments_total: number | null;
  payments_pending: number | null;
  payments_refunds: number | null;
  paid_date: string | null;
} {
  const paymentsTotal =
    asNumber(detail["paymentsTotal"]) ??
    asNumber(detail["payments_total"]);

  const paymentsPending =
    asNumber(detail["paymentsPending"]) ??
    asNumber(detail["payments_pending"]);

  const paymentsRefunds =
    asNumber(detail["paymentsRefunds"]) ??
    asNumber(detail["payments_refunds"]);

  const paymentsDetail = Array.isArray(detail["paymentsDetail"])
    ? (detail["paymentsDetail"] as any[])
    : [];

  let latestPaidDate: string | null = null;

  for (const payment of paymentsDetail) {
    const dateCandidate =
      unixToDateYmd(payment?.date) ??
      unixToDateYmd(payment?.paidAt) ??
      unixToDateYmd(payment?.createdAt) ??
      (typeof payment?.date === "string" ? payment.date.slice(0, 10) : null) ??
      (typeof payment?.paidAt === "string" ? payment.paidAt.slice(0, 10) : null) ??
      (typeof payment?.createdAt === "string"
        ? payment.createdAt.slice(0, 10)
        : null);

    if (dateCandidate && (!latestPaidDate || dateCandidate > latestPaidDate)) {
      latestPaidDate = dateCandidate;
    }
  }

  return {
    payments_total: paymentsTotal,
    payments_pending: paymentsPending,
    payments_refunds: paymentsRefunds,
    paid_date: latestPaidDate,
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
  summarySource: "list" | "detail_fallback";
  totalNet: number | null;
  totalVat: number | null;
  totalGross: number | null;
  paymentsTotal: number | null;
  paymentsPending: number | null;
  paymentsRefunds: number | null;
  paidRuleReason: string;
  computedIsPaid: boolean | null;
  desiredStateCode: string;
  paidDate: string | null;
  holdedContactExists: boolean;
  mappingExists: boolean;
  clientExists: boolean;
  externalModifiedAt: string | null;
  autoCreatedClient: boolean;
  autoCreatedMapping: boolean;
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
    raw_summary_keys: Object.keys(summary),
    summary_source: params.summarySource,
    holded_total_net_raw: params.totalNet,
    holded_total_vat_raw: params.totalVat,
    holded_total_gross_raw: params.totalGross,
    holded_payments_total_raw: params.paymentsTotal,
    holded_payments_pending_raw: params.paymentsPending,
    holded_payments_refunds_raw: params.paymentsRefunds,
    computed_is_paid: params.computedIsPaid,
    computed_paid_reason: params.paidRuleReason,
    computed_paid_date: params.paidDate,
    desired_state_code: params.desiredStateCode,
    external_modified_at_candidate: params.externalModifiedAt,
    g1_strict_mode: true,
    holded_contact_exists: params.holdedContactExists,
    holded_contact_client_mapping_exists: params.mappingExists,
    mapped_client_exists: params.clientExists,
    name_fallback_used: false,
    auto_created_client_from_holded: params.autoCreatedClient,
    auto_created_holded_contact_client_map_g1: params.autoCreatedMapping,
  };
}

export async function resolveClientForHoldedDocument(args: {
  holdedContactId: string | null;
  resolveByHoldedContactId?: HoldedContactLookup;
}): Promise<
  HoldedClientMatch & {
    holdedContactExists: boolean;
    mappingExists: boolean;
    clientExists: boolean;
    autoCreatedClient: boolean;
    autoCreatedMapping: boolean;
  }
> {
  const { holdedContactId, resolveByHoldedContactId } = args;

  if (!holdedContactId || !resolveByHoldedContactId) {
    return {
      clientId: null,
      delegateId: null,
      matchedBy: null,
      holdedContactExists: false,
      mappingExists: false,
      clientExists: false,
      autoCreatedClient: false,
      autoCreatedMapping: false,
    };
  }

  const found = await resolveByHoldedContactId(holdedContactId);

  if (!found) {
    return {
      clientId: null,
      delegateId: null,
      matchedBy: null,
      holdedContactExists: false,
      mappingExists: false,
      clientExists: false,
      autoCreatedClient: false,
      autoCreatedMapping: false,
    };
  }

  if (found.clientId && found.mappingExists && found.clientExists) {
    return {
      clientId: found.clientId,
      delegateId: found.delegateId,
      matchedBy: "holded_contact_map_g1",
      holdedContactExists: found.holdedContactExists,
      mappingExists: found.mappingExists,
      clientExists: found.clientExists,
      autoCreatedClient: found.autoCreatedClient === true,
      autoCreatedMapping: found.autoCreatedMapping === true,
    };
  }

  return {
    clientId: null,
    delegateId: null,
    matchedBy: null,
    holdedContactExists: found.holdedContactExists,
    mappingExists: found.mappingExists,
    clientExists: found.clientExists,
    autoCreatedClient: found.autoCreatedClient === true,
    autoCreatedMapping: found.autoCreatedMapping === true,
  };
}

export async function buildHoldedImportDecision(args: {
  summary: HoldedSummaryDoc;
  detail: HoldedDetailDoc;
  resolveByHoldedContactId?: HoldedContactLookup;
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
    extractHoldedContactIdentity({ summary, detail });

  if (!holdedContactId) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "missing_holded_contact_identity",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number: invoiceNumber,
        extraction_source: extractionSource,
        summary_source: summarySource,
        summary_contact: summary.contact ?? null,
        summary_contactId: summary.contactId ?? null,
        summary_contact_id: summary.contact_id ?? null,
        detail_contact: detail["contact"] ?? null,
        detail_contactId: detail["contactId"] ?? null,
        detail_contact_id: detail["contact_id"] ?? null,
      },
    };
  }

  const clientMatch = await resolveClientForHoldedDocument({
    holdedContactId,
    resolveByHoldedContactId: args.resolveByHoldedContactId,
  });

  if (!clientMatch.holdedContactExists) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "invalid_holded_contact",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number: invoiceNumber,
        holded_contact_id: holdedContactId,
        extraction_source: extractionSource,
        summary_source: summarySource,
        summary_contact: summary.contact ?? null,
        summary_contactId: summary.contactId ?? null,
        summary_contact_id: summary.contact_id ?? null,
        detail_contact: detail["contact"] ?? null,
        detail_contactId: detail["contactId"] ?? null,
        detail_contact_id: detail["contact_id"] ?? null,
      },
    };
  }

  if (!clientMatch.mappingExists) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "missing_holded_contact_client_mapping",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number: invoiceNumber,
        holded_contact_id: holdedContactId,
        extraction_source: extractionSource,
        summary_source: summarySource,
      },
    };
  }

  if (!clientMatch.clientExists || !clientMatch.clientId) {
    return {
      status: "skip",
      externalInvoiceId,
      invoiceNumber,
      reason: "mapped_client_not_found",
      diagnostics: {
        external_invoice_id: externalInvoiceId,
        invoice_number: invoiceNumber,
        holded_contact_id: holdedContactId,
        extraction_source: extractionSource,
        summary_source: summarySource,
      },
    };
  }

  const currency = extractCurrency(summary, detail);
  const clientName = extractClientName(summary, detail, contactName);

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

  const totals = extractTotals(detail);
  const payments = extractPayments(detail);

  const paidState = computeCanonicalPaidState({
    total_gross: totals.total_gross,
    payments_total: payments.payments_total,
    payments_pending: payments.payments_pending,
    payments_refunds: payments.payments_refunds,
    draft: summary.draft === true || detail["draft"] === true,
  });

  const desiredStateCode = computeDesiredStateCode({
    detail,
    summary,
    paidState,
    paymentsPending: payments.payments_pending,
  });

  const externalModifiedAt = extractExternalModifiedAt(summary, detail);

  const sourceMeta = buildSourceMeta({
    summary,
    detail,
    externalInvoiceId,
    invoiceNumber,
    currency,
    holdedContactId,
    contactName: clientName,
    extractionSource,
    summarySource,
    totalNet: totals.total_net,
    totalVat: totals.total_vat,
    totalGross: totals.total_gross,
    paymentsTotal: payments.payments_total,
    paymentsPending: payments.payments_pending,
    paymentsRefunds: payments.payments_refunds,
    paidRuleReason: paidState.reason,
    computedIsPaid: paidState.is_paid,
    desiredStateCode,
    paidDate: paidState.is_paid === true ? payments.paid_date : null,
    holdedContactExists: clientMatch.holdedContactExists,
    mappingExists: clientMatch.mappingExists,
    clientExists: clientMatch.clientExists,
    externalModifiedAt,
    autoCreatedClient: clientMatch.autoCreatedClient,
    autoCreatedMapping: clientMatch.autoCreatedMapping,
  });

  // Derive document_type from docType fields: credit/refund/abon/rectific → creditnote
  const rawDocType = pickFirstString(
    summary.docType,
    summary.documentType,
    summary.type,
    detail["docType"],
    detail["documentType"],
    detail["type"]
  ) ?? "";
  const documentType: "invoice" | "creditnote" = normalizeDocType(rawDocType) === "creditnote"
    || invoiceNumber.toUpperCase().startsWith("CN")
    ? "creditnote"
    : "invoice";

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
    total_net: totals.total_net,
    total_vat: totals.total_vat,
    total_gross: totals.total_gross,
    is_paid: paidState.is_paid,
    paid_date: paidState.is_paid === true ? payments.paid_date : null,
    document_type: documentType,
    state_code: desiredStateCode,
    external_modified_at: externalModifiedAt,
    source_meta: sourceMeta,
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
      g1_strict_mode: true,
      holded_contact_exists: clientMatch.holdedContactExists,
      holded_contact_client_mapping_exists: clientMatch.mappingExists,
      mapped_client_exists: clientMatch.clientExists,
      auto_created_client_from_holded: clientMatch.autoCreatedClient,
      auto_created_holded_contact_client_map_g1: clientMatch.autoCreatedMapping,
      computed_is_paid: paidState.is_paid,
      computed_paid_reason: paidState.reason,
      desired_state_code: desiredStateCode,
      total_gross: totals.total_gross,
      payments_total: payments.payments_total,
      payments_pending: payments.payments_pending,
      payments_refunds: payments.payments_refunds,
      paid_date: paidState.is_paid === true ? payments.paid_date : null,
      due_date: extractDueDate(detail),
      external_modified_at: externalModifiedAt,
    },
  };
}

async function resolveDelegateIdByHoldedContactId(
  supabase: SupabaseLike,
  holdedContactId: string
): Promise<string | null> {
  const { data: assignments, error: assignmentsError } = await supabase
    .from("client_actor_assignments_g1")
    .select("actor_id, valid_to, valid_from, created_at")
    .eq("client_holded_contact_id", holdedContactId)
    .eq("assignment_role", "delegate")
    .order("valid_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (assignmentsError) throw assignmentsError;

  const rows = Array.isArray(assignments) ? assignments : [];

  const active =
    rows.find((row) => {
      const record = asRecord(row);
      const validTo = asString(record?.["valid_to"]);
      return !validTo;
    }) ?? rows[0] ?? null;

  const activeRecord = asRecord(active);
  return asString(activeRecord?.["actor_id"]);
}

async function createClientFromHoldedContact(args: {
  supabase: SupabaseLike;
  holdedContactId: string;
}): Promise<{ clientId: string | null; created: boolean }> {
  const { supabase, holdedContactId } = args;

  const holdedContact = await getHoldedContactById(holdedContactId);

  const fallbackName = `HOLDed ${holdedContactId}`;

  const insertPayload: Record<string, unknown> = {
    holded_contact_id: holdedContactId,
    name: holdedContact?.name ?? fallbackName,
    legal_name: holdedContact?.legal_name ?? holdedContact?.name ?? fallbackName,
    tax_id: holdedContact?.tax_id ?? null,
    vat_number: holdedContact?.vat_number ?? null,
    contact_email: holdedContact?.contact_email ?? null,
    billing_email: holdedContact?.billing_email ?? null,
    contact_phone: holdedContact?.contact_phone ?? null,
    mobile_phone: holdedContact?.mobile_phone ?? null,
    website: holdedContact?.website ?? null,
    fiscal_address_line1: holdedContact?.fiscal_address_line1 ?? null,
    fiscal_address_line2: holdedContact?.fiscal_address_line2 ?? null,
    fiscal_city: holdedContact?.fiscal_city ?? null,
    fiscal_region: holdedContact?.fiscal_region ?? null,
    fiscal_postal_code: holdedContact?.fiscal_postal_code ?? null,
    fiscal_country: holdedContact?.fiscal_country ?? null,
    shipping_address_line1: holdedContact?.shipping_address_line1 ?? null,
    shipping_address_line2: holdedContact?.shipping_address_line2 ?? null,
    shipping_city: holdedContact?.shipping_city ?? null,
    shipping_region: holdedContact?.shipping_region ?? null,
    shipping_postal_code: holdedContact?.shipping_postal_code ?? null,
    shipping_country: holdedContact?.shipping_country ?? null,
    payment_method_name: holdedContact?.payment_method_name ?? null,
    payment_terms_name: holdedContact?.payment_terms_name ?? null,
    iban: holdedContact?.iban ?? null,
    bank_account_holder: holdedContact?.bank_account_holder ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: insertedClient, error: insertClientError } = await supabase
    .from("clients")
    .insert([insertPayload])
    .select("id")
    .single();

  if (insertClientError) throw insertClientError;

  return {
    clientId: asString(insertedClient?.id),
    created: true,
  };
}

async function ensureHoldedContactClientMapping(args: {
  supabase: SupabaseLike;
  holdedContactId: string;
  clientId: string;
}): Promise<boolean> {
  const { supabase, holdedContactId, clientId } = args;

  const { data: existingMap, error: existingMapError } = await supabase
    .from("holded_contact_client_map_g1")
    .select("holded_contact_id, client_id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (existingMapError) throw existingMapError;

  if (existingMap?.client_id) {
    return false;
  }

  const { error: insertMapError } = await supabase
    .from("holded_contact_client_map_g1")
    .insert([
      {
        holded_contact_id: holdedContactId,
        client_id: clientId,
      },
    ]);

  if (insertMapError) throw insertMapError;

  return true;
}

async function resolveByHoldedContactIdFromSupabase(
  supabase: SupabaseLike,
  holdedContactId: string
): Promise<{
  holdedContactExists: boolean;
  clientId: string | null;
  delegateId: string | null;
  mappingExists: boolean;
  clientExists: boolean;
  autoCreatedClient: boolean;
  autoCreatedMapping: boolean;
} | null> {
  const normalizedHoldedContactId = asString(holdedContactId);
  if (!normalizedHoldedContactId) {
    return null;
  }

  let autoCreatedClient = false;
  let autoCreatedMapping = false;

  const { data: holdedContactRow, error: holdedContactError } = await supabase
    .from("holded_contacts")
    .select("holded_id")
    .eq("holded_id", normalizedHoldedContactId)
    .maybeSingle();

  if (holdedContactError) throw holdedContactError;

  if (!holdedContactRow?.holded_id) {
    return {
      holdedContactExists: false,
      clientId: null,
      delegateId: null,
      mappingExists: false,
      clientExists: false,
      autoCreatedClient: false,
      autoCreatedMapping: false,
    };
  }

  const { data: existingMapRow, error: mapError } = await supabase
    .from("holded_contact_client_map_g1")
    .select("client_id")
    .eq("holded_contact_id", normalizedHoldedContactId)
    .maybeSingle();

  if (mapError) throw mapError;

  let mappedClientId = asString(existingMapRow?.client_id);

  let clientRow: any = null;

  if (mappedClientId) {
    const { data: mappedClient, error: mappedClientError } = await supabase
      .from("clients")
      .select("id, holded_contact_id")
      .eq("id", mappedClientId)
      .maybeSingle();

    if (mappedClientError) throw mappedClientError;
    clientRow = mappedClient ?? null;
  }

  if (!clientRow?.id) {
    const { data: existingClientByHoldedId, error: existingClientByHoldedIdError } =
      await supabase
        .from("clients")
        .select("id, holded_contact_id")
        .eq("holded_contact_id", normalizedHoldedContactId)
        .maybeSingle();

    if (existingClientByHoldedIdError) throw existingClientByHoldedIdError;
    clientRow = existingClientByHoldedId ?? null;
  }

  if (!clientRow?.id) {
    const createdClient = await createClientFromHoldedContact({
      supabase,
      holdedContactId: normalizedHoldedContactId,
    });

    if (!createdClient.clientId) {
      return {
        holdedContactExists: true,
        clientId: null,
        delegateId: null,
        mappingExists: false,
        clientExists: false,
        autoCreatedClient: false,
        autoCreatedMapping: false,
      };
    }

    autoCreatedClient = createdClient.created;

    const { data: createdClientRow, error: createdClientReadError } = await supabase
      .from("clients")
      .select("id, holded_contact_id")
      .eq("id", createdClient.clientId)
      .maybeSingle();

    if (createdClientReadError) throw createdClientReadError;
    clientRow = createdClientRow ?? null;
  }

  const clientId = asString(clientRow?.id);

  if (!clientId) {
    return {
      holdedContactExists: true,
      clientId: null,
      delegateId: null,
      mappingExists: false,
      clientExists: false,
      autoCreatedClient,
      autoCreatedMapping: false,
    };
  }

  autoCreatedMapping = await ensureHoldedContactClientMapping({
    supabase,
    holdedContactId: normalizedHoldedContactId,
    clientId,
  });

  const delegateId = await resolveDelegateIdByHoldedContactId(
    supabase,
    normalizedHoldedContactId
  );

  return {
    holdedContactExists: true,
    clientId,
    delegateId,
    mappingExists: true,
    clientExists: true,
    autoCreatedClient,
    autoCreatedMapping,
  };
}

async function getExistingHoldedInvoice(args: {
  supabase: SupabaseLike;
  externalInvoiceId: string;
}) {
  const { supabase, externalInvoiceId } = args;

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, state_code, is_paid, paid_date, external_invoice_id, source_provider"
    )
    .eq("source_provider", "holded")
    .eq("external_invoice_id", externalInvoiceId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function updateExistingHoldedInvoiceFields(args: {
  supabase: SupabaseLike;
  externalInvoiceId: string;
  nextStateCode: string;
  isPaid: boolean | null;
  paidDate: string | null;
  documentType: "invoice" | "creditnote";
}) {
  const { supabase, externalInvoiceId, nextStateCode, isPaid, paidDate, documentType } = args;

  const { error } = await supabase
    .from("invoices")
    .update({
      state_code: nextStateCode,
      is_paid: isPaid,
      paid_date: isPaid === true ? paidDate : null,
      document_type: documentType,
      updated_at: new Date().toISOString(),
    })
    .eq("source_provider", "holded")
    .eq("external_invoice_id", externalInvoiceId);

  if (error) throw error;
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
      externalInvoiceId: String(
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

export async function importOneHoldedInvoiceById(
  ...args: any[]
): Promise<{
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

    const detail = await (holdedFetch as any)(
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

    const acceptedDecision: Extract<HoldedImportDecision, { status: "accept" }> =
      decision;

    if (!parsed.preview) {
      const existingInvoice = await getExistingHoldedInvoice({
        supabase: parsed.supabase,
        externalInvoiceId: acceptedDecision.invoice.external_invoice_id,
      });

      if (existingInvoice) {
        const nextStateCode =
          acceptedDecision.invoice.state_code?.trim() || "OPEN";

        const currentStateCode =
          typeof existingInvoice.state_code === "string"
            ? existingInvoice.state_code
            : "OPEN";

        const nextIsPaid = acceptedDecision.invoice.is_paid;
        const currentIsPaid = existingInvoice.is_paid ?? null;
        const nextPaidDate = acceptedDecision.invoice.paid_date;
        const currentPaidDate = existingInvoice.paid_date ?? null;
        const nextDocType = acceptedDecision.invoice.document_type;

        const hasChange =
          nextStateCode !== currentStateCode ||
          nextIsPaid !== currentIsPaid ||
          nextPaidDate !== currentPaidDate;

        if (hasChange) {
          await updateExistingHoldedInvoiceFields({
            supabase: parsed.supabase,
            externalInvoiceId: acceptedDecision.invoice.external_invoice_id,
            nextStateCode,
            isPaid: nextIsPaid,
            paidDate: nextPaidDate,
            documentType: nextDocType,
          });

          parsed.logger.info(
            `[HOLDED][ONE][STATE_UPDATED] ${acceptedDecision.invoice.invoice_number} :: ${acceptedDecision.invoice.external_invoice_id} :: ${currentStateCode} -> ${nextStateCode} | is_paid: ${currentIsPaid} -> ${nextIsPaid}`
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