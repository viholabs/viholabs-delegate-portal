// VIHOLABS — HOLDed Detail Fetcher (CANONICAL WRAPPER)
// Deprecated internal client removed.
// Canonical logic lives in holdedClient.ts

import { holdedDocumentDetail } from "./holdedClient";

export async function holdedDetailFetcher<T = unknown>(
  docType: string,
  id: string
): Promise<T> {
  return holdedDocumentDetail<T>(docType, id);
}
