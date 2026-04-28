// src/lib/holded/holdedLiveStatus.ts
//
// VIHOLABS — Holded Live Invoice Status (CANONICAL)
// Single source of truth for:
//   - Fetching a Holded invoice detail via the canonical client
//   - Resolving payment method name (with in-process TTL cache)
//   - Computing the live status label (Pagado / Vencido / Pendiente)
//
// DO NOT redefine fetchHoldedInvoiceDetail or computeHoldedLiveMeta inline.

import { holdedDocumentDetail, holdedFetchJson } from "./holdedClient";
import { asString, asNumber, unixToDateYmd, todayYmdUtc, pickRecord } from "./holdedPrimitives";

// ---------------------------------------------------------------------------
// Invoice detail fetch — uses canonical holdedClient (timeout, error handling)
// ---------------------------------------------------------------------------

/**
 * Fetches a Holded invoice detail document.
 * Returns null if the API key is missing or the request fails.
 *
 * Uses the canonical holdedDocumentDetail() which enforces a 10 s timeout
 * and throws HoldedClientError on HTTP failures.
 */
export async function fetchHoldedInvoiceDetail(
  externalInvoiceId: string
): Promise<Record<string, unknown> | null> {
  const id = String(externalInvoiceId ?? "").trim();
  if (!id) return null;

  try {
    return await holdedDocumentDetail<Record<string, unknown>>("invoice", id);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Payment method catalog — cached in process memory (TTL 60 min)
// Re-fetching the whole list on every invoice view was the original bug.
// ---------------------------------------------------------------------------

type PaymentMethodCacheEntry = {
  at: number;
  map: Map<string, string>; // id → name
};

let _paymentMethodCache: PaymentMethodCacheEntry | null = null;
const PAYMENT_METHOD_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getPaymentMethodMap(): Promise<Map<string, string>> {
  const now = Date.now();

  if (_paymentMethodCache && now - _paymentMethodCache.at < PAYMENT_METHOD_TTL_MS) {
    return _paymentMethodCache.map;
  }

  try {
    const data = await holdedFetchJson<unknown>("/paymentmethods");
    const rows: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.data)
        ? ((data as Record<string, unknown>).data as unknown[])
        : [];

    const map = new Map<string, string>();
    for (const rawRow of rows) {
      const row = typeof rawRow === "object" && rawRow !== null && !Array.isArray(rawRow)
        ? (rawRow as Record<string, unknown>)
        : null;
      if (!row) continue;
      const id = asString(row["id"]) ?? asString(row["_id"]) ?? null;
      const name =
        asString(row["name"]) ?? asString(row["title"]) ?? asString(row["label"]) ?? null;
      if (id && name) map.set(id, name);
    }

    _paymentMethodCache = { at: now, map };
    return map;
  } catch {
    // Return whatever we have cached, even if stale
    return _paymentMethodCache?.map ?? new Map();
  }
}

/** Resolves a Holded paymentMethodId to its human-readable name */
export async function resolvePaymentMethodName(
  paymentMethodId: string | null
): Promise<string | null> {
  if (!paymentMethodId) return null;
  const map = await getPaymentMethodMap();
  return map.get(paymentMethodId) ?? null;
}

// ---------------------------------------------------------------------------
// Live status computation
// ---------------------------------------------------------------------------

export type HoldedLiveStatusLabel = "Pagado" | "Vencido" | "Pendiente" | "Sin estado" | "Anulado";

export type HoldedLiveMeta = {
  holded_status_label: HoldedLiveStatusLabel;
  due_date: string | null;
  payment_method_label: string | null;
  paid_date: string | null;
  is_paid: boolean;
  raw_status: string | null;
};

/**
 * Computes the canonical live status from a Holded invoice detail payload.
 *
 * isPaid rule:
 *   paymentsTotal > 0 AND (paymentsPending <= 0 OR paymentsTotal >= total)
 *
 * Label priority: Pagado → Vencido (due_date < today) → Pendiente
 */
export function computeHoldedLiveMeta(
  detail: Record<string, unknown>,
  resolvedPaymentMethod: string | null
): HoldedLiveMeta {
  const rawStatus = asString(detail["status"]);

  const multipleDueDate = pickRecord(detail["multipledueDate"]);
  const multipleDueDateAlt = pickRecord(detail["multipleDueDate"]);

  const dueDate =
    unixToDateYmd(detail["dueDate"]) ??
    unixToDateYmd(multipleDueDate?.["date"]) ??
    unixToDateYmd(multipleDueDateAlt?.["date"]) ??
    unixToDateYmd(detail["forecastDate"]);

  const total = asNumber(detail["total"]) ?? 0;
  const paymentsTotal = asNumber(detail["paymentsTotal"]) ?? 0;
  const paymentsPending = asNumber(detail["paymentsPending"]) ?? 0;

  const paymentsDetail = Array.isArray(detail["paymentsDetail"])
    ? (detail["paymentsDetail"] as Array<Record<string, unknown>>)
    : [];

  let latestPaidDate: string | null = null;
  for (const payment of paymentsDetail) {
    const dateCandidate =
      unixToDateYmd(payment?.["date"]) ??
      unixToDateYmd(payment?.["paidAt"]) ??
      unixToDateYmd(payment?.["createdAt"]);
    if (dateCandidate && (!latestPaidDate || dateCandidate > latestPaidDate)) {
      latestPaidDate = dateCandidate;
    }
  }

  const paymentMethodLabel =
    resolvedPaymentMethod ??
    asString(detail["paymentMethodName"]) ??
    asString(detail["payment_method_name"]) ??
    null;

  const isPaid =
    paymentsTotal > 0 &&
    (paymentsPending <= 0 || paymentsTotal >= total);

  const holdedStatusLabel: HoldedLiveStatusLabel = isPaid
    ? "Pagado"
    : dueDate && dueDate < todayYmdUtc()
      ? "Vencido"
      : "Pendiente";

  return {
    holded_status_label: holdedStatusLabel,
    due_date: dueDate,
    payment_method_label: paymentMethodLabel,
    paid_date: latestPaidDate,
    is_paid: isPaid,
    raw_status: rawStatus,
  };
}

// ---------------------------------------------------------------------------
// Concurrency limiter for batch Holded API calls
// ---------------------------------------------------------------------------

/**
 * Runs an array of async tasks with a bounded concurrency.
 * Prevents flooding the Holded API when resolving statuses for many invoices.
 *
 * @param tasks  Array of zero-argument async factories
 * @param limit  Max simultaneous in-flight requests (default: 8)
 */
export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit = 8
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}
