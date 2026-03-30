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

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function getSupabase() {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function pickString(
  record: Record<string, unknown> | null,
  keys: string[],
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
  keys: string[],
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
  keys: string[],
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

function mapInvoiceRow(row: unknown): ClientInvoiceView {
  const record = toRecord(row);

  return {
    id: pickString(record, ["id"]) ?? "",
    invoice_id: pickString(record, ["invoice_id", "id"]),
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
  clientId: string,
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
  holdedContactId: string | null,
) {
  if (!holdedContactId) {
    return {
      delegate_id: null,
      delegate_name: null,
    };
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("client_actor_assignments_g1")
    .select("id, client_holded_contact_id, actor_id, assignment_role, valid_from, valid_to, source, created_at")
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
  _supabase: ReturnType<typeof getSupabase>,
  clientId: string,
) {
  console.warn(
    "[CONTROL_ROOM_CLIENT_DETAIL][RECOMMENDATION][SKIP_SCHEMA_UNKNOWN]",
    {
      clientId,
    },
  );

  return {
    recommended_by_client_id: null,
    recommended_by_client_name: null,
  };
}

async function readAffiliate(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string,
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

async function readInvoices(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string,
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

  return data
    .map((row) => mapInvoiceRow(row))
    .sort((a, b) => {
      const aTime = normalizeDateForSort(a.invoice_date);
      const bTime = normalizeDateForSort(b.invoice_date);
      return bTime - aTime;
    });
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
      },
    );
    return null;
  }

  try {
    console.log("[CONTROL_ROOM_CLIENT_DETAIL][HOLDED][REQUEST]", {
      clientId,
      holdedContactId,
    });

    const holded = await getHoldedContactById(holdedContactId);

    console.log("[CONTROL_ROOM_CLIENT_DETAIL][HOLDED][OK]", {
      clientId,
      holdedContactId,
      found: Boolean(holded),
    });

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
  invoices: ClientInvoiceView[],
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

  const localShippingAddress1 = pickString(clientRow, [
    "shipping_address_line1",
    "delivery_address_line1",
  ]);
  const localShippingAddress2 = pickString(clientRow, [
    "shipping_address_line2",
    "delivery_address_line2",
  ]);
  const localShippingCity = pickString(clientRow, [
    "shipping_city",
    "delivery_city",
  ]);
  const localShippingRegion = pickString(clientRow, [
    "shipping_region",
    "delivery_region",
    "shipping_province",
  ]);
  const localShippingPostalCode = pickString(clientRow, [
    "shipping_postal_code",
    "delivery_postal_code",
    "shipping_zip_code",
  ]);
  const localShippingCountry = pickString(clientRow, [
    "shipping_country",
    "delivery_country",
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
      localFiscalAddress1,
    ),
    fiscal_address_line2: prefer(
      holded?.fiscal_address_line2 ?? null,
      localFiscalAddress2,
    ),
    fiscal_city: prefer(holded?.fiscal_city ?? null, localFiscalCity),
    fiscal_region: prefer(holded?.fiscal_region ?? null, localFiscalRegion),
    fiscal_postal_code: prefer(
      holded?.fiscal_postal_code ?? null,
      localFiscalPostalCode,
    ),
    fiscal_country: prefer(holded?.fiscal_country ?? null, localFiscalCountry),

    shipping_address_line1: prefer(
      holded?.shipping_address_line1 ?? null,
      localShippingAddress1,
    ),
    shipping_address_line2: prefer(
      holded?.shipping_address_line2 ?? null,
      localShippingAddress2,
    ),
    shipping_city: prefer(holded?.shipping_city ?? null, localShippingCity),
    shipping_region: prefer(
      holded?.shipping_region ?? null,
      localShippingRegion,
    ),
    shipping_postal_code: prefer(
      holded?.shipping_postal_code ?? null,
      localShippingPostalCode,
    ),
    shipping_country: prefer(
      holded?.shipping_country ?? null,
      localShippingCountry,
    ),

    payment_method_name: prefer(
      holded?.payment_method_name ?? null,
      localPaymentMethodName,
    ),
    payment_terms_name: prefer(
      holded?.payment_terms_name ?? null,
      localPaymentTermsName,
    ),
    iban: prefer(holded?.iban ?? null, localIban),
    bank_account_holder: prefer(
      holded?.bank_account_holder ?? null,
      localBankHolder,
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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();

    console.log("[CONTROL_ROOM_CLIENT_DETAIL][REQUEST]", {
      clientId: id,
    });

    const clientRow = await readClientCore(supabase, id);

    if (!clientRow) {
      return NextResponse.json(
        {
          ok: false,
          error: "Client not found",
        },
        { status: 404 },
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
      invoices,
    );

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    console.error("[CONTROL_ROOM_CLIENT_DETAIL][FATAL]", {
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}