// src/lib/holded/holdedPrimitives.ts
//
// VIHOLABS — Holded Primitive Utilities (CANONICAL)
// Single source of truth for low-level type coercions and date parsing
// used across all Holded integration routes and importers.
//
// DO NOT redefine these inline in route files.

// ---------------------------------------------------------------------------
// Type coercions
// ---------------------------------------------------------------------------

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const v = value.trim();
    return v.length ? v : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = asNumber(value);
    if (n !== null) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Object helpers
// ---------------------------------------------------------------------------

export function pickRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Alias for pickRecord — prefer pickRecord for clarity */
export const asRecord = pickRecord;

// ---------------------------------------------------------------------------
// String normalization
// ---------------------------------------------------------------------------

/** Uppercase + trim — used for SKU comparisons */
export function norm(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

/** Lowercase + NFD diacritics stripped — used for text matching */
export function normText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

/**
 * Permissive date parser for Holded payloads.
 *
 * Holded fields can be:
 *   - Unix timestamps in seconds (most common in detail endpoints)
 *   - Unix timestamps in milliseconds (some legacy fields)
 *   - ISO 8601 strings
 *   - Numeric strings
 *
 * Returns "YYYY-MM-DD" or null.
 */
export function unixToDateYmd(unixOrString: unknown): string | null {
  if (typeof unixOrString === "number" && Number.isFinite(unixOrString)) {
    // Distinguish seconds vs milliseconds: >9_999_999_999 means ms
    const ms = unixOrString > 9_999_999_999 ? unixOrString : unixOrString * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof unixOrString === "string" && unixOrString.trim()) {
    const raw = unixOrString.trim();
    const n = Number(raw);
    if (Number.isFinite(n)) return unixToDateYmd(n);
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

/** Returns today as "YYYY-MM-DD" in UTC */
export function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
