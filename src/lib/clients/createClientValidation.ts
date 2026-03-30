// src/lib/clients/createClientValidation.ts

export type CreateClientInput = {
  name: string;
  nif: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;

  surcharge_equivalence: boolean | null;
  payment_method_id: string;
  payment_method_name?: string | null;

  // Standby de momento: no bloquear todavía por este campo
  payment_term_id?: string | null;
  payment_term_name?: string | null;

  iban: string;
};

export type CreateClientValidationResult =
  | {
      ok: true;
      value: {
        name: string;
        nif: string;
        email: string;
        phone: string;
        address: string;
        postal_code: string;
        city: string;
        province: string;
        country: string;
        surcharge_equivalence: boolean;
        payment_method_id: string;
        payment_method_name: string | null;
        payment_term_id: string | null;
        payment_term_name: string | null;
        iban: string;
      };
    }
  | {
      ok: false;
      error: string;
      fieldErrors: Record<string, string>;
    };

function safeTrim(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNif(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeIban(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidIbanBasic(iban: string): boolean {
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban);
}

function mod97(iban: string): number {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;

  let numeric = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numeric += String(code - 55);
    } else {
      numeric += ch;
    }
  }

  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder;
}

export function isValidIban(ibanRaw: string): boolean {
  const iban = normalizeIban(ibanRaw);

  if (!isValidIbanBasic(iban)) return false;

  return mod97(iban) === 1;
}

export function validateCreateClientInput(
  input: unknown
): CreateClientValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      error: "Payload inválido",
      fieldErrors: {
        _form: "El body debe ser un objeto JSON válido.",
      },
    };
  }

  const body = input as Record<string, unknown>;

  const name = safeTrim(body.name);
  const nif = normalizeNif(safeTrim(body.nif));
  const email = normalizeEmail(safeTrim(body.email));
  const phone = safeTrim(body.phone);
  const address = safeTrim(body.address);
  const postal_code = safeTrim(body.postal_code);
  const city = safeTrim(body.city);
  const province = safeTrim(body.province);
  const country = safeTrim(body.country);

  const surcharge_equivalence =
    typeof body.surcharge_equivalence === "boolean"
      ? body.surcharge_equivalence
      : null;

  const payment_method_id = safeTrim(body.payment_method_id);
  const payment_method_name = safeTrim(body.payment_method_name) || null;

  const payment_term_id = safeTrim(body.payment_term_id) || null;
  const payment_term_name = safeTrim(body.payment_term_name) || null;

  const iban = normalizeIban(safeTrim(body.iban));

  const fieldErrors: Record<string, string> = {};

  if (!name) {
    fieldErrors.name = "El nombre es obligatorio.";
  }

  if (!nif) {
    fieldErrors.nif = "El NIF/CIF es obligatorio.";
  }

  if (!email) {
    fieldErrors.email = "El email es obligatorio.";
  } else if (!isValidEmail(email)) {
    fieldErrors.email = "El email no tiene un formato válido.";
  }

  if (surcharge_equivalence === null) {
    fieldErrors.surcharge_equivalence =
      "Debes indicar si el cliente tiene recargo de equivalencia.";
  }

  if (!payment_method_id) {
    fieldErrors.payment_method_id =
      "Debes seleccionar una forma de pago.";
  }

  if (!iban) {
    fieldErrors.iban = "El IBAN es obligatorio.";
  } else if (!isValidIban(iban)) {
    fieldErrors.iban = "El IBAN no es válido.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Faltan campos obligatorios o contienen errores.",
      fieldErrors,
    };
  }

  return {
    ok: true,
    value: {
      name,
      nif,
      email,
      phone,
      address,
      postal_code,
      city,
      province,
      country,
      surcharge_equivalence: surcharge_equivalence === true,
      payment_method_id,
      payment_method_name,
      payment_term_id,
      payment_term_name,
      iban,
    },
  };
}