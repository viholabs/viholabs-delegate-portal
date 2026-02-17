// src/lib/holded/holdedDate.ts
//
// VIHOLABS — HOLDed date normalization (canonical)
// Input from HOLDed DETAIL is Unix timestamp in SECONDS (validated).
// NO heuristics. NO fallback. Only convert if the value exists and is a number.

export type HoldedUnixSeconds = number;

export function holdedUnixSecondsToIso(value: unknown): string | null {
  // Deterministic: only accept finite numbers
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;

  // HOLDed provides seconds (not ms)
  const d = new Date(value * 1000);

  // Guard: invalid date results in "Invalid Date"
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

/**
 * Convenience helper: extracts "date" from a HOLDed detail payload safely.
 * - Returns ISO string if payload.date is a number (seconds)
 * - Else returns null
 */
export function holdedDetailDateIso(detailData: any): string | null {
  return holdedUnixSecondsToIso(detailData?.date);
}
