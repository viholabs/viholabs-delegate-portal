// src/lib/holded/fetchHoldedDocumentDetail.ts
/**
 * VIHOLABS — Holded Document Detail Fetcher
 *
 * Canon:
 * - No guessing docTypes.
 * - Evidence-based debugging: capture response body on non-2xx.
 * - Backward compatible types/params to avoid cascade edits.
 */

export type HoldedDetailOk<T = any> = {
  ok: true;
  status: number;
  data: T;
};

export type HoldedDetailErr = {
  ok: false;
  status: number | null;
  error: string;
  details?: {
    url?: string;
    responseText?: string;
  };
};

export type HoldedDetailResult<T = any> = HoldedDetailOk<T> | HoldedDetailErr;

/** BACKCOMPAT: antics noms que el repo ja importava */
export type HoldedDetailFetcherOk<T = any> = HoldedDetailOk<T>;
export type HoldedDetailFetcherResult<T = any> = HoldedDetailResult<T>;
export type HoldedDetailFetcherInput = {
  docType: unknown;

  /** Backcompat: alguns callers envien `id` en lloc de `documentId` */
  id?: unknown;
  documentId?: unknown;

  /** Backcompat: alguns callers passen apiKey explícita */
  apiKey?: unknown;

  baseUrl?: string;
  debug?: boolean;
};

function redactKeyPrefix(key: string | undefined | null) {
  const k = String(key ?? "");
  if (!k) return "";
  return k.slice(0, 6) + "...";
}

function normalizeDocType(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) throw new Error("Missing docType (empty)");
  return s;
}

function normalizeDocumentId(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) throw new Error("Missing documentId (empty)");
  return s;
}

export async function fetchHoldedDocumentDetail(
  params: HoldedDetailFetcherInput
): Promise<HoldedDetailFetcherResult> {
  const baseUrl = String(params.baseUrl ?? "https://api.holded.com").replace(/\/+$/, "");

  let docType: string;
  let documentId: string;

  try {
    docType = normalizeDocType(params.docType);
    const rawId = params.documentId ?? params.id;
    documentId = normalizeDocumentId(rawId);
  } catch (e) {
    return {
      ok: false,
      status: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const apiKeyFromCaller = String(params.apiKey ?? "").trim();
  const apiKey = apiKeyFromCaller || process.env.HOLDED_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      status: null,
      error: "HOLDED_API_KEY is missing (caller did not provide apiKey, and server env is empty)",
    };
  }

  // Holded docs: /api/invoicing/v1/documents/{docType}/{documentId}
  const url = `${baseUrl}/api/invoicing/v1/documents/${encodeURIComponent(docType)}/${encodeURIComponent(
    documentId
  )}`;

  if (params.debug) {
    // eslint-disable-next-line no-console
    console.log("HOLDED DEBUG → apiKeyPrefix:", redactKeyPrefix(apiKey));
    // eslint-disable-next-line no-console
    console.log("HOLDED DEBUG → detail_url:", url);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        key: apiKey,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      status: null,
      error: `Holded fetch network error: ${e instanceof Error ? e.message : String(e)}`,
      details: { url },
    };
  }

  const status = res.status;

  let responseText = "";
  try {
    responseText = await res.text();
  } catch {
    responseText = "";
  }

  if (params.debug) {
    // eslint-disable-next-line no-console
    console.log("HOLDED DEBUG → http_status:", status);
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.log("HOLDED DEBUG → error_body:", responseText.slice(0, 2000));
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      status,
      error: `Holded detail fetch failed (${status})`,
      details: {
        url,
        responseText: responseText ? responseText.slice(0, 4000) : "",
      },
    };
  }

  try {
    const data = responseText ? (JSON.parse(responseText) as any) : null;
    return { ok: true, status, data };
  } catch (e) {
    return {
      ok: false,
      status,
      error: `Holded detail JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
      details: {
        url,
        responseText: responseText ? responseText.slice(0, 4000) : "",
      },
    };
  }
}
