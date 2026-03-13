/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildHoldedImportDecision } from "./holdedInvoiceImporter";

type SupabaseLike = {
  from: (table: string) => any;
};

type IncrementalDocInput = {
  summary: Record<string, unknown>;
  detail: Record<string, unknown>;
};

type ClientResolution = {
  clientId: string | null;
  delegateId: string | null;
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
  const lineNetAmount = toNumber(row?.line_net_amount ?? row?.line_subtotal ?? 0, 0);
  const vatRate = toNumber(row?.vat_rate ?? row?.tax_rate ?? 0, 0);
  const lineVatAmount = toNumber(row?.line_vat_amount ?? row?.vat_amount ?? 0, 0);
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
    state_code: row.state_code ?? "OPEN",
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
    state_code: row.state_code ?? "OPEN",
    external_modified_at: row.external_modified_at ?? null,
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

function looksLikeMissingClientMapping(reason: unknown): boolean {
  const s = toNullableString(reason)?.toLowerCase() ?? "";
  if (!s) return false;

  return (
    s.includes("no client mapping") ||
    s.includes("missing client mapping") ||
    s.includes("g1 strict")
  );
}

function extractHoldedContactIdFromDocOrDecision(doc: IncrementalDocInput, decision: any): string | null {
  return (
    toNullableString(decision?.invoice?.holded_contact_id) ??
    toNullableString(decision?.diagnostics?.holded_contact_id) ??
    toNullableString(decision?.detail?.holded_contact_id) ??
    toNullableString(doc?.detail?.holded_contact_id) ??
    toNullableString(doc?.detail?.contactId) ??
    toNullableString(doc?.detail?.contact_id) ??
    toNullableString(doc?.summary?.holded_contact_id) ??
    toNullableString(doc?.summary?.contactId) ??
    toNullableString(doc?.summary?.contact_id) ??
    null
  );
}

function extractClientNameFromDocOrDecision(doc: IncrementalDocInput, decision: any): string | null {
  return (
    toNullableString(decision?.invoice?.client_name) ??
    toNullableString(decision?.invoice?.client_name_raw) ??
    toNullableString(decision?.diagnostics?.client_name) ??
    toNullableString(decision?.diagnostics?.contact_name) ??
    toNullableString(doc?.detail?.client_name) ??
    toNullableString(doc?.detail?.clientName) ??
    toNullableString(doc?.detail?.contact_name) ??
    toNullableString(doc?.detail?.name) ??
    toNullableString(doc?.summary?.client_name) ??
    toNullableString(doc?.summary?.clientName) ??
    toNullableString(doc?.summary?.contact_name) ??
    toNullableString(doc?.summary?.name) ??
    null
  );
}

async function findClientByHoldedContactId(
  supabase: SupabaseLike,
  holdedContactId: string
): Promise<ClientResolution | null> {
  const { data: mapRow, error: mapError } = await supabase
    .from("holded_contact_client_map_g1")
    .select("client_id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (mapError) throw mapError;
  if (!mapRow?.client_id) return null;

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select("id, delegate_id")
    .eq("id", mapRow.client_id)
    .maybeSingle();

  if (clientError) throw clientError;

  if (!clientRow) {
    return {
      clientId: mapRow.client_id ?? null,
      delegateId: null,
    };
  }

  return {
    clientId: clientRow.id ?? mapRow.client_id ?? null,
    delegateId: clientRow.delegate_id ?? null,
  };
}

async function createClientFromHoldedIfMissing(args: {
  supabase: SupabaseLike;
  holdedContactId: string;
  clientName: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
}): Promise<ClientResolution | null> {
  const { supabase, holdedContactId, clientName, logger = console } = args;

  const existingByMap = await findClientByHoldedContactId(supabase, holdedContactId);
  if (existingByMap?.clientId) {
    return existingByMap;
  }

  const { data: existingClient, error: existingClientError } = await supabase
    .from("clients")
    .select("id, delegate_id, holded_contact_id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (existingClientError) throw existingClientError;

  if (existingClient?.id) {
    const { data: existingMap, error: existingMapError } = await supabase
      .from("holded_contact_client_map_g1")
      .select("client_id")
      .eq("holded_contact_id", holdedContactId)
      .maybeSingle();

    if (existingMapError) throw existingMapError;

    if (!existingMap?.client_id) {
      const { error: insertMapError } = await supabase
        .from("holded_contact_client_map_g1")
        .insert({
          holded_contact_id: holdedContactId,
          client_id: existingClient.id,
          notes: "Auto-created mapping from Holded incremental import",
        });

      if (insertMapError) throw insertMapError;
    }

    return {
      clientId: existingClient.id ?? null,
      delegateId: existingClient.delegate_id ?? null,
    };
  }

  const isCompany = inferIsCompany(clientName);

  const clientInsertPayload = {
    name: clientName,
    name_raw: clientName,
    legal_name: clientName,
    holded_contact_id: holdedContactId,
    status: "active",
    state_code: "OPEN",
    is_company: isCompany,
    updated_at: new Date().toISOString(),
  };

  const { data: insertedClient, error: insertClientError } = await supabase
    .from("clients")
    .insert(clientInsertPayload)
    .select("id, delegate_id")
    .single();

  if (insertClientError) throw insertClientError;

  const { error: insertMapError } = await supabase
    .from("holded_contact_client_map_g1")
    .insert({
      holded_contact_id: holdedContactId,
      client_id: insertedClient.id,
      notes: "Auto-created from Holded because client did not exist in portal",
    });

  if (insertMapError) throw insertMapError;

  logger.info(
    `[HOLDED][CLIENT_CREATED] ${clientName} :: ${holdedContactId} :: ${insertedClient.id}`
  );

  return {
    clientId: insertedClient.id ?? null,
    delegateId: insertedClient.delegate_id ?? null,
  };
}

async function ensureAcceptedDecisionHasClient(args: {
  supabase: SupabaseLike;
  decision: any;
  logger?: Pick<Console, "info" | "warn" | "error">;
}): Promise<any> {
  const { supabase, decision, logger = console } = args;

  if (decision?.status !== "accept") {
    return decision;
  }

  const currentClientId = toNullableString(decision?.invoice?.client_id);
  if (currentClientId) {
    return decision;
  }

  const holdedContactId = toNullableString(decision?.invoice?.holded_contact_id);
  const clientName =
    toNullableString(decision?.invoice?.client_name) ??
    toNullableString(decision?.invoice?.client_name_raw);

  if (!holdedContactId || !clientName) {
    return decision;
  }

  const resolution = await createClientFromHoldedIfMissing({
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
    },
  };
}

async function tryRecoverSkipByAutoCreatingClient(args: {
  supabase: SupabaseLike;
  doc: IncrementalDocInput;
  decision: any;
  preview: boolean;
  resolveByHoldedContactId: (holdedContactId: string) => Promise<ClientResolution | null>;
  resolveByContactNamePreviewOnly: (contactName: string) => Promise<ClientResolution | null>;
  logger?: Pick<Console, "info" | "warn" | "error">;
}): Promise<any> {
  const {
    supabase,
    doc,
    decision,
    preview,
    resolveByHoldedContactId,
    resolveByContactNamePreviewOnly,
    logger = console,
  } = args;

  if (preview) {
    return decision;
  }

  if (decision?.status !== "skip") {
    return decision;
  }

  if (!looksLikeMissingClientMapping(decision?.reason)) {
    return decision;
  }

  const holdedContactId = extractHoldedContactIdFromDocOrDecision(doc, decision);
  const clientName = extractClientNameFromDocOrDecision(doc, decision);

  if (!holdedContactId || !clientName) {
    return decision;
  }

  await createClientFromHoldedIfMissing({
    supabase,
    holdedContactId,
    clientName,
    logger,
  });

  const rebuiltDecision = await buildHoldedImportDecision({
    summary: doc.summary,
    detail: doc.detail,
    resolveByHoldedContactId,
    resolveByContactNamePreviewOnly,
    enableNameFallbackInPreview: preview,
  });

  if (rebuiltDecision?.status === "accept") {
    const ensuredDecision = await ensureAcceptedDecisionHasClient({
      supabase,
      decision: rebuiltDecision,
      logger,
    });

    return {
      ...ensuredDecision,
      diagnostics: {
        ...(ensuredDecision?.diagnostics ?? {}),
        recovered_from_missing_client_mapping: true,
      },
    };
  }

  return rebuiltDecision;
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
    .select("id, external_invoice_id, source_provider, state_code")
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

async function updateExistingInvoiceStateCodeIfNeeded(args: {
  supabase: SupabaseLike;
  invoiceId: string;
  currentStateCode: string | null;
  nextStateCode: string | null;
}) {
  const currentStateCode = toNullableString(args.currentStateCode);
  const nextStateCode = toNullableString(args.nextStateCode);

  if (!args.invoiceId) {
    return { updated: false };
  }

  if (!nextStateCode || nextStateCode === currentStateCode) {
    return { updated: false };
  }

  const { error } = await args.supabase
    .from("invoices")
    .update({
      state_code: nextStateCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.invoiceId);

  if (error) throw error;

  return { updated: true };
}

export async function resolveByHoldedContactIdFactory(supabase: SupabaseLike) {
  return async (holdedContactId: string) => {
    return findClientByHoldedContactId(supabase, holdedContactId);
  };
}

export async function resolveByContactNamePreviewFactory(supabase: SupabaseLike) {
  return async (contactName: string) => {
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
  };
}

export async function importHoldedDocumentsIncremental(args: {
  supabase: SupabaseLike;
  docs: IncrementalDocInput[];
  preview?: boolean;
  logger?: Pick<Console, "info" | "warn" | "error">;
}) {
  const { supabase, docs, preview = false, logger = console } = args;

  const resolveByHoldedContactId = await resolveByHoldedContactIdFactory(supabase);
  const resolveByContactNamePreviewOnly =
    await resolveByContactNamePreviewFactory(supabase);

  const accepted: any[] = [];
  const skipped: any[] = [];

  for (const doc of docs) {
    let decision = await buildHoldedImportDecision({
      summary: doc.summary,
      detail: doc.detail,
      resolveByHoldedContactId,
      resolveByContactNamePreviewOnly,
      enableNameFallbackInPreview: preview,
    });

    decision = await tryRecoverSkipByAutoCreatingClient({
      supabase,
      doc,
      decision,
      preview,
      resolveByHoldedContactId,
      resolveByContactNamePreviewOnly,
      logger,
    });

    if (decision.status === "accept" && !preview) {
      decision = await ensureAcceptedDecisionHasClient({
        supabase,
        decision,
        logger,
      });
    }

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
      updatedStates: 0,
    };
  }

  if (accepted.length === 0) {
    return {
      accepted,
      skipped,
      insertedInvoices: 0,
      insertedItems: 0,
      existingInvoices: 0,
      updatedStates: 0,
    };
  }

  const normalizedAccepted = accepted.map((acceptedDoc: any) => {
    const rawItems: any[] = Array.isArray(acceptedDoc.items) ? acceptedDoc.items : [];
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

  const allInvoiceRows = normalizedAccepted.map((x: any) => x.sanitizedInvoice);

  const existingInvoicesByExternalId = await loadExistingInvoicesByExternalId({
    supabase,
    externalInvoiceIds: allInvoiceRows.map((row: any) => row.external_invoice_id),
  });

  const invoiceRowsToInsert: any[] = [];
  const existingAcceptedDocs: any[] = [];
  let updatedStates = 0;

  for (const acceptedDoc of normalizedAccepted) {
    const sanitizedInvoice = acceptedDoc.sanitizedInvoice;
    const externalInvoiceId = toNullableString(sanitizedInvoice?.external_invoice_id);

    if (!externalInvoiceId) {
      invoiceRowsToInsert.push(sanitizedInvoice);
      continue;
    }

    const existingInvoice = existingInvoicesByExternalId.get(externalInvoiceId);

    if (!existingInvoice) {
      invoiceRowsToInsert.push(sanitizedInvoice);
      continue;
    }

    await updateExistingInvoiceStateCodeIfNeeded({
      supabase,
      invoiceId: existingInvoice.id,
      currentStateCode: existingInvoice.state_code ?? null,
      nextStateCode: sanitizedInvoice.state_code ?? null,
    }).then((result) => {
      if (result.updated) {
        updatedStates += 1;
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
    `[HOLDED][OK] inserted_invoices=${invoiceRowsToInsert.length} existing_invoices=${existingAcceptedDocs.length} updated_states=${updatedStates} items=${itemRows.length} skipped=${skipped.length}`
  );

  return {
    accepted,
    skipped,
    insertedInvoices: invoiceRowsToInsert.length,
    insertedItems: itemRows.length,
    existingInvoices: existingAcceptedDocs.length,
    updatedStates,
  };
}

export async function runHoldedInvoicesIncrementalImport(...args: any[]): Promise<any> {
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