// src/lib/holded/holdedDetailCache.ts
/**
 * VIHOLABS — HOLDed Detail Cache (in-memory, best-effort)
 *
 * Canon:
 * - No persistence
 * - No schema changes
 * - Used only to reduce repeat calls within a single process lifetime
 */

import { holdedDocumentDetail } from "./holdedClient";

type CacheKey = string;

type CacheEntry = {
  at: number; // ms
  value: unknown;
};

const DEFAULT_TTL_MS = 60_000;

const mem = new Map<CacheKey, CacheEntry>();

function key(docType: string, id: string): CacheKey {
  return `${String(docType)}::${String(id)}`;
}

export async function getHoldedDetailCached<T = unknown>(args: {
  docType: string;
  id: string;
  ttlMs?: number;
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const docType = String(args.docType ?? "").trim();
  const id = String(args.id ?? "").trim();
  const ttlMs = Number.isFinite(args.ttlMs as any) ? Number(args.ttlMs) : DEFAULT_TTL_MS;

  if (!docType) return { ok: false, error: "Missing docType" };
  if (!id) return { ok: false, error: "Missing id" };

  const k = key(docType, id);
  const now = Date.now();

  const hit = mem.get(k);
  if (hit && now - hit.at <= ttlMs) {
    return { ok: true, data: hit.value as T };
  }

  try {
    // ✅ Canonical signature (docType, id)
    const data = await holdedDocumentDetail<T>(docType, id);
    mem.set(k, { at: now, value: data });
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
