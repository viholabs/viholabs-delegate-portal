// src/lib/holded/holdedIncremental.ts
/**
 * VIHOLABS — HOLDed Incremental IDs Engine (CANONICAL)
 *
 * Purpose:
 * - Fetch changed document IDs from Holded within a time window.
 * - SINGLE SOURCE of truth for incremental listing.
 *
 * Contract:
 * - Uses the canonical Holded client (holdedClient.ts).
 * - Does NOT perform DB writes.
 *
 * NOTE:
 * - Accepts since/until as either YYYY-MM-DD string OR Date (for route compatibility).
 * - We include defensive filtering by updatedAt/createdAt/date when present.
 */

import { holdedListDocuments } from "./holdedClient";

export type HoldedDocType = "invoice" | "creditnote" | string;

export type FetchChangedIdsArgs = {
  docType: HoldedDocType;
  since: string | Date; // YYYY-MM-DD OR Date
  until: string | Date; // YYYY-MM-DD OR Date
  page?: number;
  pageSize?: number;
};

type HoldedListItem = {
  id?: string;
  _id?: string;
  // common date-ish fields observed across Holded payloads
  date?: number | string | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toYmdUTC(v: string | Date): string {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = v.getUTCMonth() + 1;
    const d = v.getUTCDate();
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  const s = String(v).trim();
  if (!s) throw new Error("since/until empty");

  // If already YYYY-MM-DD, keep
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try parsing other date strings safely
  const ms = Date.parse(s);
  if (!Number.isNaN(ms)) {
    return toYmdUTC(new Date(ms));
  }

  throw new Error(`Invalid date format for since/until: "${s}"`);
}

function toDateMs(v: unknown): number | null {
  if (v === null || v === undefined) return null;

  // numeric unix seconds or ms
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e12) return v; // ms
    if (v > 1e9) return v * 1000; // seconds → ms
    return null;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    const asNum = Number(s);
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(s)) {
      return toDateMs(asNum);
    }

    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) return ms;
  }

  return null;
}

function ymdToStartMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function ymdToEndMsExclusive(ymd: string): number {
  const start = ymdToStartMs(ymd);
  return start + 24 * 60 * 60 * 1000;
}

function extractId(it: HoldedListItem): string | null {
  const id = (it.id ?? it._id ?? null) as any;
  if (typeof id === "string" && id.trim()) return id.trim();
  return null;
}

function bestTimestampMs(it: HoldedListItem): number | null {
  return (
    toDateMs(it.updatedAt) ??
    toDateMs(it.createdAt) ??
    toDateMs(it.date) ??
    null
  );
}

export async function fetchChangedIds(args: FetchChangedIdsArgs): Promise<string[]> {
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 50;

  const sinceYmd = toYmdUTC(args.since);
  const untilYmd = toYmdUTC(args.until);

  // Holded endpoint supports startDate/endDate query.
  // We still defensively filter locally.
  const items = await holdedListDocuments<HoldedListItem[]>(
    args.docType,
    {
      startDate: sinceYmd,
      endDate: untilYmd,
      page,
      limit: pageSize,
    }
  );

  const sinceMs = ymdToStartMs(sinceYmd);
  const untilMsExcl = ymdToEndMsExclusive(untilYmd);

  const out: string[] = [];

  for (const it of items || []) {
    const id = extractId(it);
    if (!id) continue;

    const ts = bestTimestampMs(it);
    if (ts === null) {
      // If Holded doesn't provide timestamps, accept within window query result.
      out.push(id);
      continue;
    }

    if (ts >= sinceMs && ts < untilMsExcl) {
      out.push(id);
    }
  }

  // De-dupe while preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of out) {
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }

  return deduped;
}
