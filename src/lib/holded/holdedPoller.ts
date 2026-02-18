/**
 * VIHOLABS — HOLDED POLLER (CANÒNIC)
 *
 * - Sense estat extern (excepte lock infra de procés)
 * - Sense dependència UI
 * - Node runtime compatible
 * - Single entry-point: holdedClient.ts
 * - Concurrency-safe: 1 execució simultània màxim (backpressure)
 */

import { holdedListDocuments } from "./holdedClient";
import { tryAcquireLock, releaseLock } from "@/lib/infra/processLock";

// Canon lock TTL (recuperació si queda “penjat”)
const POLL_LOCK_TTL_MS = 30_000;

export type HoldedInvoice = {
  id: string;
  docNumber?: string;
  contactName?: string;
  total?: number;
  date?: number;
  status?: number;
};

export type HoldedPollResult = {
  ok: boolean;
  fetched: number;
  invoices: HoldedInvoice[];
  error?: string;
};

function clampLimit(limit: unknown, fallback = 50, max = 200): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function pollHoldedInvoices(limit = 50): Promise<HoldedPollResult> {
  const safeLimit = clampLimit(limit, 50, 200);

  // Backpressure: si ja hi ha una execució en curs, no fem res.
  const acquired = tryAcquireLock(POLL_LOCK_TTL_MS);
  if (!acquired) {
    return { ok: false, fetched: 0, invoices: [], error: "Busy (poll already running)" };
  }

  try {
    // Canon: list documents via holdedClient
    const json = await holdedListDocuments<any[]>("invoice", { limit: safeLimit });

    if (!Array.isArray(json)) {
      return {
        ok: false,
        fetched: 0,
        invoices: [],
        error: "Invalid Holded response shape (expected array)",
      };
    }

    const invoices: HoldedInvoice[] = json
      .map((inv: any) => ({
        id: String(inv?.id ?? inv?._id ?? "").trim(),
        docNumber: inv?.docNumber ? String(inv.docNumber) : undefined,
        contactName: inv?.contactName ? String(inv.contactName) : undefined,
        total: typeof inv?.total === "number" ? inv.total : undefined,
        date: typeof inv?.date === "number" ? inv.date : undefined,
        status: typeof inv?.status === "number" ? inv.status : undefined,
      }))
      .filter((x) => x.id.length > 0);

    return { ok: true, fetched: invoices.length, invoices };
  } catch (e: any) {
    return { ok: false, fetched: 0, invoices: [], error: e?.message ?? "Unknown Holded error" };
  } finally {
    releaseLock();
  }
}
