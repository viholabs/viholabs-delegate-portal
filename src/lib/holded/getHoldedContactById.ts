import { holdedFetchJson } from "@/lib/holded/holdedFetch";

export type HoldedContactRaw = Record<string, unknown> | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function pickFirstString(
  source: Record<string, unknown> | null,
  candidates: string[],
): string | null {
  if (!source) return null;
  for (const key of candidates) {
    const value = asString(source[key]);
    if (value) return value;
  }
  return null;
}

function pickNestedRecord(
  source: Record<string, unknown> | null,
  candidates: string[],
): Record<string, unknown> | null {
  if (!source) return null;
  for (const key of candidates) {
    const record = asRecord(source[key]);
    if (record) return record;
  }
  return null;
}

function pickFirstFromNested(
  source: Record<string, unknown> | null,
  nestedCandidates: string[],
  fieldCandidates: string[],
): string | null {
  const nested = pickNestedRecord(source, nestedCandidates);
  return pickFirstString(nested, fieldCandidates);
}

function joinAddressLine1(parts: Array<string | null | undefined>): string | null {
  const clean = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return clean.length ? clean.join(", ") : null;
}

export type HoldedContactView = {
  raw: HoldedContactRaw;

  name: string | null;
  legal_name: string | null;
  tax_id: string | null;
  vat_number: string | null;

  contact_email: string | null;
  billing_email: string | null;
  contact_phone: string | null;
  mobile_phone: string | null;
  website: string | null;

  fiscal_address_line1: string | null;
  fiscal_address_line2: string | null;
  fiscal_city: string | null;
  fiscal_region: string | null;
  fiscal_postal_code: string | null;
  fiscal_country: string | null;

  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_region: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;

  payment_method_name: string | null;
  payment_terms_name: string | null;

  iban: string | null;
  bank_account_holder: string | null;
};

export async function getHoldedContactById(
  holdedContactId: string,
): Promise<HoldedContactView | null> {
  const id = holdedContactId.trim();
  if (!id) return null;

  const raw = await holdedFetchJson(`/contacts/${encodeURIComponent(id)}`);
  const contact = asRecord(raw);

  if (!contact) {
    return null;
  }

  const billingAddress =
    pickNestedRecord(contact, ["billAddress", "billingAddress", "billing_address"]) ??
    pickNestedRecord(contact, ["address"]);

  const shippingAddress =
    pickNestedRecord(contact, [
      "shippingAddress",
      "shipping_address",
      "deliveryAddress",
      "delivery_address",
    ]) ??
    (Array.isArray(contact["shippingAddresses"])
      ? asRecord((contact["shippingAddresses"] as unknown[])[0])
      : null);

  const bankInfo =
    pickNestedRecord(contact, ["bankInfo", "bank_info", "bank"]) ??
    pickNestedRecord(contact, ["bankAccount", "bank_account"]);

  // Holded returns paymentMethod / paymentDue as nested objects: { id, name }
  const paymentMethodObj = pickNestedRecord(contact, ["paymentMethod", "payment_method"]);
  const paymentTermsObj = pickNestedRecord(contact, ["paymentDue", "paymentType", "payment_due", "payment_type"]);

  const paymentInfo =
    pickNestedRecord(contact, ["payment", "paymentInfo", "payment_info"]) ?? null;

  const contactEmails = asStringArray(contact["emails"]);
  const billingEmails = asStringArray(contact["invoiceEmails"]);

  const fiscalStreet = pickFirstString(billingAddress, [
    "street",
    "address",
    "line1",
    "address1",
  ]);
  const fiscalNumber = pickFirstString(billingAddress, [
    "number",
    "streetNumber",
    "street_number",
  ]);

  const shippingStreet = pickFirstString(shippingAddress, [
    "street",
    "address",
    "line1",
    "address1",
  ]);
  const shippingNumber = pickFirstString(shippingAddress, [
    "number",
    "streetNumber",
    "street_number",
  ]);

  return {
    raw: contact,

    name: pickFirstString(contact, ["name", "tradeName", "trade_name"]),
    legal_name: pickFirstString(contact, [
      "companyName",
      "legalName",
      "legal_name",
      "socialName",
      "social_name",
      "name",
    ]),
    tax_id: pickFirstString(contact, ["taxId", "tax_id", "vatNumber", "vat_number"]),
    vat_number: pickFirstString(contact, ["vatNumber", "vat_number", "taxId", "tax_id"]),

    contact_email:
      pickFirstString(contact, ["email", "contactEmail", "contact_email"]) ??
      contactEmails[0] ??
      null,

    billing_email:
      pickFirstString(contact, ["invoiceEmail", "billingEmail", "billing_email"]) ??
      billingEmails[0] ??
      null,

    contact_phone:
      pickFirstString(contact, ["phone", "phoneNumber", "phone_number"]) ??
      pickFirstFromNested(contact, ["contact"], ["phone", "phoneNumber"]) ??
      null,

    mobile_phone: pickFirstString(contact, ["mobile", "mobilePhone", "mobile_phone"]),
    website: pickFirstString(contact, ["website", "web"]),

    fiscal_address_line1: joinAddressLine1([fiscalStreet, fiscalNumber]),
    fiscal_address_line2: pickFirstString(billingAddress, [
      "line2",
      "address2",
      "details",
      "extra",
    ]),
    fiscal_city: pickFirstString(billingAddress, ["city", "town"]),
    fiscal_region: pickFirstString(billingAddress, [
      "province",
      "region",
      "state",
      "county",
    ]),
    fiscal_postal_code: pickFirstString(billingAddress, [
      "postalCode",
      "postal_code",
      "zip",
      "zipCode",
      "zip_code",
    ]),
    fiscal_country: pickFirstString(billingAddress, [
      "country",
      "countryName",
      "country_name",
      "countryCode",
      "country_code",
    ]),

    shipping_address_line1: joinAddressLine1([shippingStreet, shippingNumber]),
    shipping_address_line2: pickFirstString(shippingAddress, [
      "line2",
      "address2",
      "details",
      "extra",
    ]),
    shipping_city: pickFirstString(shippingAddress, ["city", "town"]),
    shipping_region: pickFirstString(shippingAddress, [
      "province",
      "region",
      "state",
      "county",
    ]),
    shipping_postal_code: pickFirstString(shippingAddress, [
      "postalCode",
      "postal_code",
      "zip",
      "zipCode",
      "zip_code",
    ]),
    shipping_country: pickFirstString(shippingAddress, [
      "country",
      "countryName",
      "country_name",
      "countryCode",
      "country_code",
    ]),

    payment_method_name:
      pickFirstString(paymentMethodObj, ["name"]) ??
      pickFirstString(paymentInfo, ["methodName", "method_name", "name"]) ??
      pickFirstString(contact, ["paymentMethodName", "payment_method_name"]) ??
      null,

    payment_terms_name:
      pickFirstString(paymentTermsObj, ["name"]) ??
      pickFirstString(paymentInfo, ["termsName", "terms_name", "paymentTerms", "name"]) ??
      pickFirstString(contact, ["paymentTermsName", "payment_terms_name"]) ??
      null,

    iban:
      pickFirstString(bankInfo, ["iban", "accountNumber", "account_number"]) ??
      pickFirstString(pickNestedRecord(contact, ["bankAccount", "bank_account"]), ["iban", "accountNumber"]) ??
      pickFirstString(contact, ["iban", "bankIban", "bank_iban"]) ??
      null,

    bank_account_holder:
      pickFirstString(bankInfo, ["holder", "accountHolder", "account_holder", "name"]) ??
      pickFirstString(contact, ["bankAccountHolder", "bank_account_holder"]) ??
      null,
  };
}