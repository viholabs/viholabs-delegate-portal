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
 * Canonical decision (post-audit 2026-02-24):
 * - HOLDed returns inconsistent/ambiguous timestamp fields (date/createdAt/updatedAt)
 *   for "invoice" documents, causing false negatives when filtering locally.
 * - Therefore, we TRUST upstream filtering via startDate/endDate query (YYYY-MM-DD),
 *   and we DO NOT apply additional local time-window filtering.
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

function extractId(it: HoldedListItem): string | null {
  const id = (it.id ?? it._id ?? null) as any;
  if (typeof id === "string" && id.trim()) return id.trim();
  return null;
}

export async function fetchChangedIds(args: FetchChangedIdsArgs): Promise<string[]> {
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 50;

  const sinceYmd = toYmdUTC(args.since);
  const untilYmd = toYmdUTC(args.until);

  // Holded endpoint supports startDate/endDate query.
  // Canonical: trust upstream filtering; do not locally filter by timestamps.
  const items = await holdedListDocuments<HoldedListItem[]>(
    args.docType,
    {
      startDate: sinceYmd,
      endDate: untilYmd,
      page,
      limit: pageSize,
    }
  );

  const out: string[] = [];

  for (const it of items || []) {
    const id = extractId(it);
    if (!id) continue;
    out.push(id);
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
