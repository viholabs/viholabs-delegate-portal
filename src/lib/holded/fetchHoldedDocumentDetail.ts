// VIHOLABS — HOLDed Detail Fetcher (CANONICAL WRAPPER)
// This file is intentionally kept for backward compatibility.
// Canonical logic lives in holdedClient.ts

import { holdedDocumentDetail } from "./holdedClient";

export async function fetchHoldedDocumentDetail<T = unknown>(
  docType: string,
  documentId: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await holdedDocumentDetail<T>(docType, documentId);

    return {
      ok: true,
      data,
    };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.message ||
        "Unknown Holded detail fetch failure",
    };
  }
}
