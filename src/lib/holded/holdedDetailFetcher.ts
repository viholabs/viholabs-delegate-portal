/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Actor: HOLDed_AGENT
 * Reason: Canonical date resolution via Holded DETAIL endpoint
 * Scope: Detail fetch only — no schema/UI changes
 */

const HOLDed_API_BASE = "https://api.holded.com/api/invoicing/v1/documents";

type HoldedDocType = "invoice" | "estimate" | "salesreceipt" | "creditnote" | string;

const detailCache = new Map<string, any>();

function cacheKey(docType: HoldedDocType, id: string) {
  return `${docType}::${id}`;
}

export async function fetchHoldedDocumentDetail(
  docType: HoldedDocType,
  id: string
): Promise<any> {
  const key = cacheKey(docType, id);

  if (detailCache.has(key)) {
    return detailCache.get(key);
  }

  const apiKey = process.env.HOLDED_API_KEY;

  if (!apiKey) {
    throw new Error("HOLDED_API_KEY missing");
  }

  const res = await fetch(`${HOLDed_API_BASE}/${docType}/${id}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      key: apiKey,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Holded detail fetch failed (${res.status})`);
  }

  const json = await res.json();

  detailCache.set(key, json);

  return json;
}
