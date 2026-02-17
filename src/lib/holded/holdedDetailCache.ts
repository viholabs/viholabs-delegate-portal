// src/lib/holded/holdedDetailCache.ts
//
// VIHOLABS — HOLDed DETAIL cache (in-memory, TTL, bounded)
// - Deterministic key: baseUrl|docType|id
// - Cache ONLY successful (ok:true) detail responses
// - No Supabase schema, no UI, no heuristics
//
// IMPORTANT:
// - Uses RELATIVE imports (no @/ alias) so it is runnable in Node tests too.

import type {
  HoldedDetailFetcherInput,
  HoldedDetailFetcherOk,
  HoldedDetailFetcherResult,
} from "./fetchHoldedDocumentDetail";
import { fetchHoldedDocumentDetail } from "./fetchHoldedDocumentDetail";

type CacheEntry = {
  value: HoldedDetailFetcherOk;
  expires_at_ms: number;
  inserted_at_ms: number;
};

function nowMs() {
  return Date.now();
}

function normalizeBaseUrl(u: string) {
  return (u || "").replace(/\/+$/, "");
}

function keyOf(baseUrl: string, docType: string, id: string) {
  return `${normalizeBaseUrl(baseUrl)}|${String(docType || "").trim()}|${String(id || "").trim()}`;
}

function getTtlMs(): number {
  const raw = (process.env.HOLDED_DETAIL_CACHE_TTL_MS || "").trim();
  const n = Number.parseInt(raw, 10);
  // default 10 minutes
  return Number.isFinite(n) && n > 0 ? n : 10 * 60 * 1000;
}

function getMaxEntries(): number {
  const raw = (process.env.HOLDED_DETAIL_CACHE_MAX || "").trim();
  const n = Number.parseInt(raw, 10);
  // default 500 docs
  return Number.isFinite(n) && n > 0 ? n : 500;
}

// Module-scope cache (memoization within the same Node.js runtime)
const CACHE = new Map<string, CacheEntry>();

function pruneExpired() {
  const t = nowMs();
  for (const [k, entry] of CACHE.entries()) {
    if (entry.expires_at_ms <= t) CACHE.delete(k);
  }
}

function pruneToMax() {
  const max = getMaxEntries();
  if (CACHE.size <= max) return;

  // Evict oldest inserted first (deterministic)
  const entries = Array.from(CACHE.entries());
  entries.sort((a, b) => a[1].inserted_at_ms - b[1].inserted_at_ms);

  const toRemove = CACHE.size - max;
  for (let i = 0; i < toRemove; i++) {
    CACHE.delete(entries[i][0]);
  }
}

export type HoldedDetailCachedResult =
  | (HoldedDetailFetcherOk & { cache: "hit" | "miss" })
  | (Exclude<HoldedDetailFetcherResult, HoldedDetailFetcherOk> & { cache: "miss" });

export async function fetchHoldedDocumentDetailCached(
  input: HoldedDetailFetcherInput
): Promise<HoldedDetailCachedResult> {
  const id = String(input?.id ?? "").trim();
  const baseUrl = normalizeBaseUrl(
    input.baseUrl ?? process.env.HOLDED_BASE_URL ?? "https://api.holded.com"
  );
  const docType =
    String(input.docType ?? process.env.HOLDED_DOC_TYPE ?? "invoice").trim() ||
    "invoice";

  pruneExpired();

  const k = keyOf(baseUrl, docType, id);
  const hit = CACHE.get(k);
  const t = nowMs();

  if (hit && hit.expires_at_ms > t) {
    return { ...hit.value, cache: "hit" };
  }

  const res = await fetchHoldedDocumentDetail({
    ...input,
    id,
    baseUrl,
    docType,
  });

  // Cache only ok:true
  if (res.ok) {
    const ttl = getTtlMs();
    CACHE.set(k, {
      value: res,
      inserted_at_ms: t,
      expires_at_ms: t + ttl,
    });
    pruneToMax();
    return { ...res, cache: "miss" };
  }

  return { ...res, cache: "miss" };
}

export function holdedDetailCacheStats() {
  pruneExpired();
  return {
    size: CACHE.size,
    ttl_ms: getTtlMs(),
    max_entries: getMaxEntries(),
  };
}

export function holdedDetailCacheClear() {
  CACHE.clear();
  return { ok: true };
}
