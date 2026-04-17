import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getHoldedContactById } from "@/lib/holded/getHoldedContactById";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ClientActorBundle = {
  delegate_id: string | null;
  delegate_name: string | null;
  recommended_by_client_id: string | null;
  recommended_by_client_name: string | null;
  affiliate_account_id: string | null;
  affiliate_name: string | null;
};

type ClientInvoiceView = {
  id: string;
  invoice_id: string | null;
  external_invoice_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  client_id: string | null;
  client_name: string | null;
  total_net: number | null;
  total_gross: number | null;
  total_tax: number | null;
  currency: string | null;
  state_code: string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  source_provider: string | null;
};

type SafeHoldedContact = Awaited<ReturnType<typeof getHoldedContactById>>;

type ClientPatchPayload = {
  name?: unknown;
  legal_name?: unknown;
  tax_id?: unknown;
  vat_number?: unknown;

  contact_email?: unknown;
  billing_email?: unknown;
  contact_phone?: unknown;
  mobile_phone?: unknown;
  website?: unknown;

  fiscal_address_line1?: unknown;
  fiscal_address_line2?: unknown;
  fiscal_city?: unknown;
  fiscal_region?: unknown;
  fiscal_postal_code?: unknown;
  fiscal_country?: unknown;

  shipping_address_line1?: unknown;
  shipping_address_line2?: unknown;
  shipping_city?: unknown;
  shipping_region?: unknown;
  shipping_postal_code?: unknown;
  shipping_country?: unknown;

  payment_method_name?: unknown;
  payment_terms_name?: unknown;
  iban?: unknown;
  bank_account_holder?: unknown;

  profile_type?: unknown;
  status?: unknown;
  state_code?: unknown;
};

type HoldedInvoiceLiveMeta = {
  due_date: string | null;
  paid_date: string | null;
  is_paid: boolean | null;
  state_code: string | null;
};

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value.trim();
}

function getSupabase() {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    }
  );
}

function getHoldedApiKey(): string {
  const candidates = [
    process.env.HOLDED_API_KEY,
    process.env.HOLDED_APIKEY,
    process.env.NEXT_PRIVATE_HOLDED_API_KEY,
    process.env.HOLDED_KEY,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  throw new Error(
    "Missing Holded API key. Expected one of: HOLDED_API_KEY, HOLDED_APIKEY, NEXT_PRIVATE_HOLDED_API_KEY, HOLDED_KEY"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function pickString(
  record: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }

  return null;
}

function pickNumber(
  record: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!record) return null;

  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== null) return value;
  }

  return null;
}

function pickBoolean(
  record: Record<string, unknown> | null,
  keys: string[]
): boolean | null {
  if (!record) return null;

  for (const key of keys) {
    const value = asBoolean(record[key]);
    if (value !== null) return value;
  }

  return null;
}

function prefer(primary: string | null, fallback: string | null): string | null {
  return primary ?? fallback ?? null;
}

function buildMasterDataSource(params: {
  holdedContactId: string | null;
  holdedEnriched: boolean;
}): "holded" | "clients" | "mixed" {
  if (!params.holdedContactId) {
    return "clients";
  }

  if (params.holdedEnriched) {
    return "mixed";
  }

  return "clients";
}

function normalizeDateForSort(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function normalizeNullableInput(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return null;
}

function normalizeIban(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
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

async function fetchHoldedInvoiceDetail(
  externalInvoiceId: string
): Promise<Record<string, unknown> | null> {
  const apiKey = getHoldedApiKey();

  const response = await fetch(
    `https://api.holded.com/api/invoicing/v1/documents/invoice/${encodeURIComponent(
      externalInvoiceId
    )}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        key: apiKey,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  return toRecord(payload);
}

function computeHoldedInvoiceLiveMeta(
  detail: Record<string, unknown>
): HoldedInvoiceLiveMeta {
  const multipleDueDate = toRecord(detail["multipledueDate"]);
  const multipleDueDateAlt = toRecord(detail["multipleDueDate"]);

  const dueDate =
    unixToDateYmd(detail["dueDate"]) ??
    unixToDateYmd(multipleDueDate?.["date"]) ??
    unixToDateYmd(multipleDueDateAlt?.["date"]) ??
    unixToDateYmd(detail["forecastDate"]);

  const total = asNumber(detail["total"]) ?? 0;
  const paymentsTotal =
    asNumber(detail["paymentsTotal"]) ??
    asNumber(detail["payments_total"]) ??
    0;
  const paymentsPending =
    asNumber(detail["paymentsPending"]) ??
    asNumber(detail["payments_pending"]) ??
    0;

  const paymentsDetail = Array.isArray(detail["paymentsDetail"])
    ? (detail["paymentsDetail"] as Array<Record<string, unknown>>)
    : [];

  let latestPaidDate: string | null = null;

  for (const payment of paymentsDetail) {
    const dateCandidate =
      unixToDateYmd(payment?.["date"]) ??
      unixToDateYmd(payment?.["paidAt"]) ??
      unixToDateYmd(payment?.["createdAt"]);

    if (dateCandidate && (!latestPaidDate || dateCandidate > latestPaidDate)) {
      latestPaidDate = dateCandidate;
    }
  }

  const isPaid =
    paymentsTotal > 0 &&
    (paymentsPending <= 0 || paymentsTotal >= total);

  const rawStatus = asString(detail["status"])?.toLowerCase() ?? null;

  const stateCode = isPaid
    ? "SETTLED"
    : rawStatus === "cancelled" ||
        rawStatus === "canceled" ||
        rawStatus === "anulado"
      ? "INVALID"
      : "OPEN";

  return {
    due_date: dueDate,
    paid_date: latestPaidDate,
    is_paid: isPaid,
    state_code: stateCode,
  };
}

function mapInvoiceRow(row: unknown): ClientInvoiceView {
  const record = toRecord(row);

  return {
    id: pickString(record, ["id"]) ?? "",
    invoice_id: pickString(record, ["invoice_id", "id"]),
    external_invoice_id: pickString(record, ["external_invoice_id"]),
    invoice_number: pickString(record, [
      "invoice_number",
      "doc_number",
      "document_number",
      "number",
    ]),
    invoice_date: pickString(record, [
      "invoice_date",
      "date",
      "issued_at",
      "created_at",
    ]),
    due_date: pickString(record, [
      "due_date",
      "due_at",
      "expiration_date",
      "expires_at",
      "payment_due_date",
    ]),
    client_id: pickString(record, ["client_id"]),
    client_name: pickString(record, ["client_name", "name", "legal_name"]),
    total_net: pickNumber(record, ["total_net", "subtotal", "base_amount"]),
    total_gross: pickNumber(record, ["total_gross", "total", "grand_total"]),
    total_tax: pickNumber(record, ["total_tax", "tax_amount", "tax_total"]),
    currency: pickString(record, ["currency", "currency_code"]),
    state_code: pickString(record, ["state_code", "status", "invoice_status"]),
    is_paid: pickBoolean(record, ["is_paid", "paid"]),
    paid_date: pickString(record, ["paid_date", "paid_at"]),
    source_provider: pickString(record, ["source_provider", "provider", "source"]),
  };
}

async function readClientCore(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return toRecord(data);
}

async function readDelegate(
  supabase: ReturnType<typeof getSupabase>,
  holdedContactId: string | null
) {
  if (!holdedContactId) {
    return {
      delegate_id: null,
      delegate_name: null,
    };
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("client_actor_assignments_g1")
    .select(
      "id, client_holded_contact_id, actor_id, assignment_role, valid_from, valid_to, source, created_at"
    )
    .eq("client_holded_contact_id", holdedContactId)
    .eq("assignment_role", "delegate")
    .order("valid_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  const assignmentList = Array.isArray(assignments) ? assignments : [];

  const activeAssignment =
    assignmentList.find((row) => {
      const record = toRecord(row);
      const validTo = pickString(record, ["valid_to"]);
      return !validTo;
    }) ?? assignmentList[0] ?? null;

  const assignmentRecord = toRecord(activeAssignment);
  const delegateId = pickString(assignmentRecord, ["actor_id"]);

  if (!delegateId) {
    return {
      delegate_id: null,
      delegate_name: null,
    };
  }

  const { data: actor, error: actorError } = await supabase
    .from("actors")
    .select("id, name")
    .eq("id", delegateId)
    .maybeSingle();

  if (actorError) {
    throw new Error(actorError.message);
  }

  const actorRecord = toRecord(actor);

  return {
    delegate_id: delegateId,
    delegate_name: asString(actorRecord?.name),
  };
}

async function readRecommendationSafely(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string
) {
  const { data: recommendations, error: recommendationError } = await supabase
    .from("client_recommendations")
    .select(
      "id, recommender_client_id, referred_client_id, percentage, active, valid_from, valid_to, notes, created_at, updated_at, mode, state_code"
    )
    .eq("referred_client_id", clientId)
    .order("active", { ascending: false })
    .order("valid_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (recommendationError) {
    throw new Error(recommendationError.message);
  }

  const rows = Array.isArray(recommendations)
    ? recommendations
        .map((row) => toRecord(row))
        .filter(Boolean) as Record<string, unknown>[]
    : [];

  if (rows.length === 0) {
    return {
      recommended_by_client_id: null,
      recommended_by_client_name: null,
    };
  }

  const activeOpenRow =
    rows.find((row) => {
      const active = row.active === true;
      const validTo = pickString(row, ["valid_to"]);
      const stateCode = pickString(row, ["state_code"]);
      return active && !validTo && stateCode === "OPEN";
    }) ?? null;

  const fallbackRow = rows[0] ?? null;
  const chosenRow = activeOpenRow ?? fallbackRow;

  const recommenderClientId = pickString(chosenRow, ["recommender_client_id"]);

  if (!recommenderClientId) {
    return {
      recommended_by_client_id: null,
      recommended_by_client_name: null,
    };
  }

  const { data: recommenderClient, error: recommenderClientError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", recommenderClientId)
    .maybeSingle();

  if (recommenderClientError) {
    throw new Error(recommenderClientError.message);
  }

  const recommenderClientRecord = toRecord(recommenderClient);

  return {
    recommended_by_client_id: recommenderClientId,
    recommended_by_client_name: asString(recommenderClientRecord?.name),
  };
}

async function readAffiliate(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string
) {
  const { data: affiliateEvent, error: affiliateError } = await supabase
    .from("affiliate_attribution_events")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (affiliateError) {
    throw new Error(affiliateError.message);
  }

  const affiliateRecord = toRecord(affiliateEvent);
  const affiliateAccountId = pickString(affiliateRecord, [
    "affiliate_account_id",
    "affiliate_id",
    "actor_id",
  ]);

  if (!affiliateAccountId) {
    return {
      affiliate_account_id: null,
      affiliate_name: null,
    };
  }

  const { data: affiliateActor, error: actorError } = await supabase
    .from("actors")
    .select("id, name")
    .eq("id", affiliateAccountId)
    .maybeSingle();

  if (actorError) {
    throw new Error(actorError.message);
  }

  const affiliateActorRecord = toRecord(affiliateActor);

  return {
    affiliate_account_id: affiliateAccountId,
    affiliate_name: asString(affiliateActorRecord?.name),
  };
}

async function enrichInvoiceWithHoldedLiveData(
  invoice: ClientInvoiceView
): Promise<ClientInvoiceView> {
  if (invoice.source_provider !== "holded") {
    return invoice;
  }

  const externalInvoiceId = asString(invoice.external_invoice_id);
  if (!externalInvoiceId) {
    return invoice;
  }

  try {
    const holdedDetail = await fetchHoldedInvoiceDetail(externalInvoiceId);
    if (!holdedDetail) {
      return invoice;
    }

    const liveMeta = computeHoldedInvoiceLiveMeta(holdedDetail);

    return {
      ...invoice,
      due_date: liveMeta.due_date ?? invoice.due_date,
      paid_date: liveMeta.paid_date ?? invoice.paid_date,
      is_paid:
        typeof liveMeta.is_paid === "boolean"
          ? liveMeta.is_paid
          : invoice.is_paid,
      state_code: liveMeta.state_code ?? invoice.state_code,
    };
  } catch (error) {
    console.error("[CONTROL_ROOM_CLIENT_DETAIL][INVOICES][HOLDED_LIVE_ERROR]", {
      invoiceId: invoice.id,
      externalInvoiceId,
      message: error instanceof Error ? error.message : "Unknown Holded error",
    });

    return invoice;
  }
}

async function readInvoices(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string
): Promise<ClientInvoiceView[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId);

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  const baseInvoices = data
    .map((row) => mapInvoiceRow(row))
    .sort((a, b) => {
      const aTime = normalizeDateForSort(a.invoice_date);
      const bTime = normalizeDateForSort(b.invoice_date);
      return bTime - aTime;
    });

  const enrichedInvoices = await Promise.all(
    baseInvoices.map((invoice) => enrichInvoiceWithHoldedLiveData(invoice))
  );

  return enrichedInvoices;
}

async function readHoldedContactSafely(params: {
  clientId: string;
  holdedContactId: string | null;
}): Promise<SafeHoldedContact | null> {
  const { clientId, holdedContactId } = params;

  if (!holdedContactId) {
    console.warn(
      "[CONTROL_ROOM_CLIENT_DETAIL][HOLDED][SKIP] missing_holded_contact_id",
      {
        clientId,
      }
    );
    return null;
  }

  try {
    const holded = await getHoldedContactById(holdedContactId);
    return holded;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Holded error";

    console.error("[CONTROL_ROOM_CLIENT_DETAIL][HOLDED][ERROR]", {
      clientId,
      holdedContactId,
      message,
    });

    return null;
  }
}

function buildClientDetail(
  clientRow: Record<string, unknown>,
  holded: SafeHoldedContact | null,
  actors: ClientActorBundle,
  invoices: ClientInvoiceView[]
) {
  const holdedContactId = asString(clientRow.holded_contact_id);

  const localName = pickString(clientRow, ["name", "trade_name"]);
  const localLegalName = pickString(clientRow, [
    "legal_name",
    "company_name",
    "business_name",
    "name",
  ]);
  const localTaxId = pickString(clientRow, [
    "tax_id",
    "vat_number",
    "vat",
    "fiscal_id",
    "nif",
    "cif",
  ]);
  const localVatNumber = pickString(clientRow, [
    "vat_number",
    "vat",
    "tax_id",
    "fiscal_id",
  ]);

  const localContactEmail = pickString(clientRow, [
    "contact_email",
    "email",
    "email_contact",
  ]);
  const localBillingEmail = pickString(clientRow, [
    "billing_email",
    "invoice_email",
    "email_billing",
    "email",
  ]);
  const localPhone = pickString(clientRow, [
    "contact_phone",
    "phone",
    "phone_number",
    "mobile",
  ]);

  const localFiscalAddress1 = pickString(clientRow, [
    "fiscal_address_line1",
    "billing_address_line1",
    "address_line1",
    "address",
  ]);
  const localFiscalAddress2 = pickString(clientRow, [
    "fiscal_address_line2",
    "billing_address_line2",
    "address_line2",
  ]);
  const localFiscalCity = pickString(clientRow, [
    "fiscal_city",
    "billing_city",
    "city",
  ]);
  const localFiscalRegion = pickString(clientRow, [
    "fiscal_region",
    "billing_region",
    "province",
    "region",
    "state",
  ]);
  const localFiscalPostalCode = pickString(clientRow, [
    "fiscal_postal_code",
    "billing_postal_code",
    "postal_code",
    "zip_code",
    "zip",
  ]);
  const localFiscalCountry = pickString(clientRow, [
    "fiscal_country",
    "billing_country",
    "country",
  ]);

  const localPaymentMethodName = pickString(clientRow, [
    "payment_method_name",
    "payment_method",
  ]);
  const localPaymentTermsName = pickString(clientRow, [
    "payment_terms_name",
    "payment_terms",
    "payment_term_name",
  ]);
  const localIban = pickString(clientRow, ["iban"]);
  const localBankHolder = pickString(clientRow, [
    "bank_account_holder",
    "account_holder",
  ]);

  return {
    id: asString(clientRow.id),

    name: prefer(holded?.name ?? null, localName),
    legal_name: prefer(holded?.legal_name ?? null, localLegalName),
    tax_id: prefer(holded?.tax_id ?? null, localTaxId),
    vat_number: prefer(holded?.vat_number ?? null, localVatNumber),

    contact_email: prefer(holded?.contact_email ?? null, localContactEmail),
    billing_email: prefer(holded?.billing_email ?? null, localBillingEmail),
    contact_phone: prefer(holded?.contact_phone ?? null, localPhone),
    mobile_phone: holded?.mobile_phone ?? null,
    website: holded?.website ?? null,

    fiscal_address_line1: prefer(
      holded?.fiscal_address_line1 ?? null,
      localFiscalAddress1
    ),
    fiscal_address_line2: prefer(
      holded?.fiscal_address_line2 ?? null,
      localFiscalAddress2
    ),
    fiscal_city: prefer(holded?.fiscal_city ?? null, localFiscalCity),
    fiscal_region: prefer(holded?.fiscal_region ?? null, localFiscalRegion),
    fiscal_postal_code: prefer(
      holded?.fiscal_postal_code ?? null,
      localFiscalPostalCode
    ),
    fiscal_country: prefer(holded?.fiscal_country ?? null, localFiscalCountry),

    shipping_address_line1: holded?.shipping_address_line1 ?? null,
    shipping_address_line2: holded?.shipping_address_line2 ?? null,
    shipping_city: holded?.shipping_city ?? null,
    shipping_region: holded?.shipping_region ?? null,
    shipping_postal_code: holded?.shipping_postal_code ?? null,
    shipping_country: holded?.shipping_country ?? null,

    payment_method_name: prefer(
      holded?.payment_method_name ?? null,
      localPaymentMethodName
    ),
    payment_terms_name: prefer(
      holded?.payment_terms_name ?? null,
      localPaymentTermsName
    ),
    iban: prefer(holded?.iban ?? null, localIban),
    bank_account_holder: prefer(
      holded?.bank_account_holder ?? null,
      localBankHolder
    ),

    holded_contact_id: holdedContactId,

    delegate_id: actors.delegate_id,
    delegate_name: actors.delegate_name,

    recommended_by_client_id: actors.recommended_by_client_id,
    recommended_by_client_name: actors.recommended_by_client_name,

    affiliate_account_id: actors.affiliate_account_id,
    affiliate_name: actors.affiliate_name,

    sepa_status: pickString(clientRow, ["sepa_status"]),
    sepa_reference: pickString(clientRow, ["sepa_reference"]),
    sepa_generated_at: pickString(clientRow, ["sepa_generated_at"]),
    sepa_signed_at: pickString(clientRow, ["sepa_signed_at"]),
    sepa_document_path: pickString(clientRow, ["sepa_document_path"]),

    profile_type: pickString(clientRow, ["profile_type"]),
    status: pickString(clientRow, ["status"]),
    state_code: pickString(clientRow, ["state_code"]),

    created_at: pickString(clientRow, ["created_at"]),
    updated_at: pickString(clientRow, ["updated_at"]),

    invoices,

    meta: {
      master_data_source: buildMasterDataSource({
        holdedContactId,
        holdedEnriched: Boolean(holded),
      }),
      holded_enriched: Boolean(holded),
    },
  };
}

function buildDbPatch(payload: ClientPatchPayload) {
  return {
    name: normalizeNullableInput(payload.name),
    legal_name: normalizeNullableInput(payload.legal_name),
    tax_id: normalizeNullableInput(payload.tax_id),
    vat_number: normalizeNullableInput(payload.vat_number),

    contact_email: normalizeNullableInput(payload.contact_email),
    billing_email: normalizeNullableInput(payload.billing_email),
    contact_phone: normalizeNullableInput(payload.contact_phone),

    fiscal_address_line1: normalizeNullableInput(payload.fiscal_address_line1),
    fiscal_address_line2: normalizeNullableInput(payload.fiscal_address_line2),
    fiscal_city: normalizeNullableInput(payload.fiscal_city),
    fiscal_region: normalizeNullableInput(payload.fiscal_region),
    fiscal_postal_code: normalizeNullableInput(payload.fiscal_postal_code),
    fiscal_country: normalizeNullableInput(payload.fiscal_country),

    payment_method_name: normalizeNullableInput(payload.payment_method_name),
    payment_terms_name: normalizeNullableInput(payload.payment_terms_name),
    iban: normalizeIban(normalizeNullableInput(payload.iban)),
    bank_account_holder: normalizeNullableInput(payload.bank_account_holder),

    profile_type: normalizeNullableInput(payload.profile_type),
    status: normalizeNullableInput(payload.status),
    state_code: normalizeNullableInput(payload.state_code),
  };
}

function buildHoldedPatch(payload: ClientPatchPayload) {
  return {
    name: normalizeNullableInput(payload.name),
    legalName: normalizeNullableInput(payload.legal_name),
    code: normalizeNullableInput(payload.tax_id),
    vatnumber: normalizeNullableInput(payload.vat_number),

    email: normalizeNullableInput(payload.contact_email),
    invoiceEmail: normalizeNullableInput(payload.billing_email),
    phone: normalizeNullableInput(payload.contact_phone),
    mobile: normalizeNullableInput(payload.mobile_phone),
    website: normalizeNullableInput(payload.website),

    address: normalizeNullableInput(payload.fiscal_address_line1),
    address2: normalizeNullableInput(payload.fiscal_address_line2),
    city: normalizeNullableInput(payload.fiscal_city),
    province: normalizeNullableInput(payload.fiscal_region),
    postalCode: normalizeNullableInput(payload.fiscal_postal_code),
    country: normalizeNullableInput(payload.fiscal_country),

    shippingAddress: normalizeNullableInput(payload.shipping_address_line1),
    shippingAddress2: normalizeNullableInput(payload.shipping_address_line2),
    shippingCity: normalizeNullableInput(payload.shipping_city),
    shippingProvince: normalizeNullableInput(payload.shipping_region),
    shippingPostalCode: normalizeNullableInput(payload.shipping_postal_code),
    shippingCountry: normalizeNullableInput(payload.shipping_country),

    paymentMethod: normalizeNullableInput(payload.payment_method_name),
    paymentTerms: normalizeNullableInput(payload.payment_terms_name),
    iban: normalizeIban(normalizeNullableInput(payload.iban)),
    bankAccountHolder: normalizeNullableInput(payload.bank_account_holder),
  };
}

function stripUndefinedAndNull(
  record: Record<string, string | null>
): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }

  return output;
}

async function updateHoldedContact(params: {
  holdedContactId: string;
  payload: ClientPatchPayload;
}) {
  const apiKey = getHoldedApiKey();

  const holdedPayload = stripUndefinedAndNull(buildHoldedPatch(params.payload));

  const response = await fetch(
    `https://api.holded.com/api/invoicing/v1/contacts/${params.holdedContactId}`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        key: apiKey,
      },
      cache: "no-store",
      body: JSON.stringify(holdedPayload),
    }
  );

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(
      `Holded update failed (${response.status}): ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`
    );
  }

  return payload;
}

async function updateClientRow(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string,
  patch: ReturnType<typeof buildDbPatch>
) {
  const { error } = await supabase
    .from("clients")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);

  if (error) {
    throw new Error(error.message);
  }
}

async function buildFreshDetail(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string
) {
  const clientRow = await readClientCore(supabase, clientId);

  if (!clientRow) {
    throw new Error("Client not found after update");
  }

  const holdedContactId = asString(clientRow.holded_contact_id);

  const [holded, delegate, recommendation, affiliate, invoices] =
    await Promise.all([
      readHoldedContactSafely({
        clientId,
        holdedContactId,
      }),
      readDelegate(supabase, holdedContactId),
      readRecommendationSafely(supabase, clientId),
      readAffiliate(supabase, clientId),
      readInvoices(supabase, clientId),
    ]);

  return buildClientDetail(
    clientRow,
    holded,
    {
      delegate_id: delegate.delegate_id,
      delegate_name: delegate.delegate_name,
      recommended_by_client_id: recommendation.recommended_by_client_id,
      recommended_by_client_name: recommendation.recommended_by_client_name,
      affiliate_account_id: affiliate.affiliate_account_id,
      affiliate_name: affiliate.affiliate_name,
    },
    invoices
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();

    const clientRow = await readClientCore(supabase, id);

    if (!clientRow) {
      return NextResponse.json(
        {
          ok: false,
          error: "Client not found",
        },
        { status: 404 }
      );
    }

    const holdedContactId = asString(clientRow.holded_contact_id);

    const [holded, delegate, recommendation, affiliate, invoices] =
      await Promise.all([
        readHoldedContactSafely({
          clientId: id,
          holdedContactId,
        }),
        readDelegate(supabase, holdedContactId),
        readRecommendationSafely(supabase, id),
        readAffiliate(supabase, id),
        readInvoices(supabase, id),
      ]);

    const data = buildClientDetail(
      clientRow,
      holded,
      {
        delegate_id: delegate.delegate_id,
        delegate_name: delegate.delegate_name,
        recommended_by_client_id: recommendation.recommended_by_client_id,
        recommended_by_client_name: recommendation.recommended_by_client_name,
        affiliate_account_id: affiliate.affiliate_account_id,
        affiliate_name: affiliate.affiliate_name,
      },
      invoices
    );

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();

    const body = (await request.json()) as ClientPatchPayload;
    const clientRow = await readClientCore(supabase, id);

    if (!clientRow) {
      return NextResponse.json(
        {
          ok: false,
          error: "Client not found",
        },
        { status: 404 }
      );
    }

    const holdedContactId = asString(clientRow.holded_contact_id);
    const dbPatch = buildDbPatch(body);

    if (holdedContactId) {
      await updateHoldedContact({
        holdedContactId,
        payload: body,
      });
    }

    await updateClientRow(supabase, id, dbPatch);

    const data = await buildFreshDetail(supabase, id);

    return NextResponse.json(
      {
        ok: true,
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    console.error("[CONTROL_ROOM_CLIENT_DETAIL][PATCH][FATAL]", {
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}