// VIHOLABS — HOLDed Canonical Client
// Single Source of Truth for ALL Holded HTTP traffic
// DO NOT duplicate fetch logic outside this file

const HOLDED_API_BASE = "https://api.holded.com/api/invoicing/v1";

export class HoldedClientError extends Error {
  public readonly status: number | null;
  public readonly body: unknown;

  constructor(message: string, status: number | null = null, body: unknown = null) {
    super(message);
    this.name = "HoldedClientError";
    this.status = status;
    this.body = body;
  }
}

function requireApiKey(): string {
  const apiKey = (process.env.HOLDED_API_KEY || "").trim();

  if (!apiKey) {
    throw new HoldedClientError("HOLDED_API_KEY missing (server env)", null);
  }

  return apiKey;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rawHoldedFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const apiKey = requireApiKey();
  const controller = new AbortController();

  const timeoutMs = init?.timeoutMs ?? 10_000;

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(`${HOLDED_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        key: apiKey,
        ...(init?.headers || {}),
      } as any,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    const body = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      throw new HoldedClientError(`Holded HTTP ${res.status}`, res.status, body);
    }

    return body as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new HoldedClientError("Holded timeout", null);
    }

    if (err instanceof HoldedClientError) {
      throw err;
    }

    throw new HoldedClientError("Holded network failure", null, err);
  } finally {
    clearTimeout(timeout);
  }
}

// Generic raw-path JSON fetch.
// Use this only when you really want to hit an arbitrary Holded invoicing path.
export async function holdedFetchJson<T = unknown>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const normalizedPath = String(path ?? "").trim();

  if (!normalizedPath) {
    throw new HoldedClientError("Missing Holded path", null);
  }

  const safePath = normalizedPath.startsWith("/")
    ? normalizedPath
    : `/${normalizedPath}`;

  return rawHoldedFetch<T>(safePath, init);
}

/* ===========================
   DOCUMENTS (CANONICAL)
   =========================== */

function buildSearchParams(
  query?: Record<string, string | number | boolean | null | undefined>
) {
  const qs = new URLSearchParams();

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined) qs.set(k, String(v));
    }
  }

  return qs;
}

function extractArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;

    if (Array.isArray(p.items)) return p.items as T[];
    if (Array.isArray(p.data)) return p.data as T[];
    if (Array.isArray(p.results)) return p.results as T[];
    if (Array.isArray(p.documents)) return p.documents as T[];
  }

  return [];
}

export async function holdedListDocuments<T = unknown>(
  docType: string,
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const baseQuery = { ...(query ?? {}) };

  const requestedLimitRaw = Number(baseQuery.limit ?? 0);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.floor(requestedLimitRaw)
      : null;

  delete (baseQuery as any).page;
  delete (baseQuery as any).offset;

  const pageSize =
    requestedLimit && requestedLimit < 100 ? requestedLimit : 100;

  const maxPages = 50;
  const all: unknown[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const qs = buildSearchParams({
      ...baseQuery,
      limit: pageSize,
      page,
    });

    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    const payload = await rawHoldedFetch<unknown>(
      `/documents/${encodeURIComponent(docType)}${suffix}`
    );

    const rows = extractArrayPayload(payload);

    if (rows.length === 0) {
      break;
    }

    all.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    if (requestedLimit && all.length >= requestedLimit) {
      break;
    }
  }

  const finalRows =
    requestedLimit && all.length > requestedLimit
      ? all.slice(0, requestedLimit)
      : all;

  return finalRows as T;
}

export async function holdedDocumentDetail<T = unknown>(
  docType: string,
  id: string
): Promise<T> {
  if (!id) throw new HoldedClientError("Missing Holded document id", null);

  return rawHoldedFetch<T>(
    `/documents/${encodeURIComponent(docType)}/${encodeURIComponent(id)}`
  );
}

/* ===========================
   CONTACTS (CANONICAL)
   =========================== */

export type HoldedContact = {
  id?: string;
  _id?: string;
  name?: string | null;
  commercialName?: string | null;
  tradeName?: string | null;
  email?: string | null;
  vatNumber?: string | null;
  phone?: string | null;
};

export async function holdedContactDetail<T = HoldedContact>(
  contactId: string
): Promise<T> {
  const id = String(contactId ?? "").trim();
  if (!id) throw new HoldedClientError("Missing Holded contact id", null);

  return rawHoldedFetch<T>(`/contacts/${encodeURIComponent(id)}`);
}

export async function holdedListContacts<T = HoldedContact[]>(
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const qs = buildSearchParams(query);
  const suffix = qs.toString() ? `?${qs}` : "";

  return rawHoldedFetch<T>(`/contacts${suffix}`);
}