// src/components/control-room/orders/utils.ts

import type { BundleDef, NewClientForm, ProductRow } from "./types";

export function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function toNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchJson(url: string) {
  const r = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const j = await r.json().catch(() => ({}));

  return { ok: r.ok, status: r.status, json: j };
}

export function normalizeProducts(payload: unknown): {
  products: ProductRow[];
  bundles: BundleDef[];
} {
  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const productsRaw = Array.isArray(source.products) ? source.products : [];
  const bundlesRaw = Array.isArray(source.bundles) ? source.bundles : [];

  const products: ProductRow[] = productsRaw
    .map((p) => {
      const row =
        p && typeof p === "object" ? (p as Record<string, unknown>) : {};

      return {
        id: row.id == null ? null : safeStr(row.id),
        sku: safeStr(row.sku).trim(),
        name: row.name == null ? null : safeStr(row.name),
        description: row.description == null ? null : safeStr(row.description),
        is_bundle: !!row.is_bundle,
      };
    })
    .filter((p) => !!p.sku);

  const bundles: BundleDef[] = bundlesRaw
    .map((b) => {
      const row =
        b && typeof b === "object" ? (b as Record<string, unknown>) : {};

      const itemsRaw = Array.isArray(row.items) ? row.items : [];

      return {
        sku: safeStr(row.sku).trim(),
        title: row.title == null ? null : safeStr(row.title),
        description: row.description == null ? null : safeStr(row.description),
        items: itemsRaw
          .map((it) => {
            const item =
              it && typeof it === "object"
                ? (it as Record<string, unknown>)
                : {};

            return {
              sku: safeStr(item.sku).trim(),
              quantity: Math.max(1, Math.floor(toNum(item.quantity, 1))),
              unit_price_override:
                item.unit_price_override == null
                  ? null
                  : toNum(item.unit_price_override, 0),
            };
          })
          .filter((it) => !!it.sku),
      };
    })
    .filter((b) => !!b.sku);

  return { products, bundles };
}

export function normalizeTaxId(raw: string) {
  return safeStr(raw).replace(/\s+/g, "").toUpperCase().trim();
}

export function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeStr(v));
}

export function isValidSpanishTaxId(raw: string) {
  const value = normalizeTaxId(raw);
  if (!value) return false;

  const dni = /^(\d{8})([A-Z])$/;
  const nie = /^[XYZ]\d{7}[A-Z]$/;
  const cif = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/;

  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";

  const dniMatch = value.match(dni);
  if (dniMatch) {
    const num = Number(dniMatch[1]);
    const letter = dniMatch[2];
    return letters[num % 23] === letter;
  }

  if (nie.test(value)) {
    const first = value[0] === "X" ? "0" : value[0] === "Y" ? "1" : "2";
    const num = Number(`${first}${value.slice(1, 8)}`);
    const letter = value[8];
    return letters[num % 23] === letter;
  }

  if (cif.test(value)) {
    const control = value[value.length - 1];
    const digits = value
      .slice(1, 8)
      .split("")
      .map((n) => Number(n));

    const sumEven = digits
      .filter((_, idx) => idx % 2 === 1)
      .reduce((acc, n) => acc + n, 0);

    const sumOdd = digits
      .filter((_, idx) => idx % 2 === 0)
      .reduce((acc, n) => {
        const doubled = n * 2;
        return acc + Math.floor(doubled / 10) + (doubled % 10);
      }, 0);

    const total = sumEven + sumOdd;
    const unit = (10 - (total % 10)) % 10;
    const controlLetter = "JABCDEFGHI"[unit];
    const firstLetter = value[0];

    const mustBeLetter = /[KPQS]/.test(firstLetter);
    const mustBeDigit = /[ABEH]/.test(firstLetter);

    if (mustBeLetter) return control === controlLetter;
    if (mustBeDigit) return control === String(unit);
    return control === String(unit) || control === controlLetter;
  }

  return false;
}

export function emptyNewClientForm(): NewClientForm {
  return {
    name: "",
    tax_id: "",
    phone: "",
    email: "",
    shipping_address: "",
    shipping_postal_code: "",
    shipping_city: "",
    shipping_province: "",
    shipping_country: "España",
    equivalence_surcharge: "",
    payment_method_id: "",
    payment_term_label: "",
    iban: "",
    notes: "",
  };
}