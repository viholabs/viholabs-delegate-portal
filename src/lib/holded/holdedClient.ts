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

function normalizePath(path: string): string {
  const normalizedPath = String(path ?? "").trim();

  if (!normalizedPath) {
    throw new HoldedClientError("Missing Holded path", null);
  }

  return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
}

function pickFirstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function firstObjectCandidate(value: unknown): Record<string, unknown> | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return item as Record<string, unknown>;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return null;
}

function unwrapContactPayload(payload: unknown): Record<string, unknown> | null {
  const direct = firstObjectCandidate(payload);
  if (!direct) return null;

  const nestedCandidates: unknown[] = [
    direct.contact,
    direct.data,
    direct.item,
    direct.result,
    direct.response,
    direct.customer,
  ];

  for (const candidate of nestedCandidates) {
    const nested = firstObjectCandidate(candidate);
    if (nested) return nested;
  }

  return direct;
}

async function rawHoldedFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const apiKey = requireApiKey();
  const controller = new AbortController();

  const timeoutMs = init?.timeoutMs ?? 10_000;
  const safePath = normalizePath(path);

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(`${HOLDED_API_BASE}${safePath}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        key: apiKey,
        ...(init?.headers || {}),
      } as HeadersInit,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    const body = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      throw new HoldedClientError(
        `Holded HTTP ${res.status} on ${safePath}`,
        res.status,
        body
      );
    }

    return body as T;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name?: string }).name === "AbortError"
    ) {
      throw new HoldedClientError(`Holded timeout on ${safePath}`, null);
    }

    if (err instanceof HoldedClientError) {
      throw err;
    }

    throw new HoldedClientError(`Holded network failure on ${safePath}`, null, err);
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
  return rawHoldedFetch<T>(path, init);
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
  const safeDocType = String(docType ?? "").trim();
  if (!safeDocType) {
    throw new HoldedClientError("Missing Holded document type", null);
  }

  const baseQuery = { ...(query ?? {}) };

  const requestedLimitRaw = Number(baseQuery.limit ?? 0);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.floor(requestedLimitRaw)
      : null;

  delete (baseQuery as Record<string, unknown>).page;
  delete (baseQuery as Record<string, unknown>).offset;

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
      `/documents/${encodeURIComponent(safeDocType)}${suffix}`
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
  const safeDocType = String(docType ?? "").trim();
  const safeId = String(id ?? "").trim();

  if (!safeDocType) {
    throw new HoldedClientError("Missing Holded document type", null);
  }

  if (!safeId) {
    throw new HoldedClientError("Missing Holded document id", null);
  }

  return rawHoldedFetch<T>(
    `/documents/${encodeURIComponent(safeDocType)}/${encodeURIComponent(safeId)}`
  );
}

/* ===========================
   CONTACTS (CANONICAL)
   =========================== */

export type HoldedContact = {
  id: string;
  _id?: string;
  name?: string | null;
  commercialName?: string | null;
  tradeName?: string | null;
  company?: string | null;
  email?: string | null;
  billingEmail?: string | null;
  invoiceEmail?: string | null;
  vatNumber?: string | null;
  vatnumber?: string | null;
  taxId?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  mobile?: string | null;
  code?: string | null;
  clientCode?: string | null;
  [key: string]: unknown;
};

function normalizeHoldedContact(payload: unknown): HoldedContact | null {
  const raw = unwrapContactPayload(payload);
  if (!raw) return null;

  const id = pickFirstNonEmptyString(
    raw.id,
    raw._id,
    raw.contactId,
    raw.contact_id
  );

  if (!id) return null;

  const normalized: HoldedContact = {
    ...raw,
    id,
    _id: pickFirstNonEmptyString(raw._id) ?? undefined,
    name:
      pickFirstNonEmptyString(
        raw.name,
        raw.commercialName,
        raw.tradeName,
        raw.company
      ) ?? null,
    commercialName: pickFirstNonEmptyString(raw.commercialName) ?? null,
    tradeName: pickFirstNonEmptyString(raw.tradeName) ?? null,
    company: pickFirstNonEmptyString(raw.company) ?? null,
    email:
      pickFirstNonEmptyString(
        raw.email,
        raw.billingEmail,
        raw.invoiceEmail
      ) ?? null,
    billingEmail: pickFirstNonEmptyString(raw.billingEmail) ?? null,
    invoiceEmail: pickFirstNonEmptyString(raw.invoiceEmail) ?? null,
    vatNumber:
      pickFirstNonEmptyString(
        raw.vatNumber,
        raw.vatnumber,
        raw.taxId,
        raw.tax_id
      ) ?? null,
    vatnumber: pickFirstNonEmptyString(raw.vatnumber, raw.vatNumber) ?? null,
    taxId: pickFirstNonEmptyString(raw.taxId, raw.tax_id) ?? null,
    tax_id: pickFirstNonEmptyString(raw.tax_id, raw.taxId) ?? null,
    phone: pickFirstNonEmptyString(raw.phone, raw.mobile) ?? null,
    mobile: pickFirstNonEmptyString(raw.mobile) ?? null,
    code: pickFirstNonEmptyString(raw.code, raw.clientCode) ?? null,
    clientCode: pickFirstNonEmptyString(raw.clientCode, raw.code) ?? null,
  };

  return normalized;
}

export async function holdedContactDetail<T = HoldedContact>(
  contactId: string
): Promise<T> {
  const id = String(contactId ?? "").trim();
  if (!id) {
    throw new HoldedClientError("Missing Holded contact id", null);
  }

  const payload = await rawHoldedFetch<unknown>(`/contacts/${encodeURIComponent(id)}`);
  const normalized = normalizeHoldedContact(payload);

  if (!normalized?.id) {
    throw new HoldedClientError(
      `Holded contact payload without canonical id for ${id}`,
      null,
      payload
    );
  }

  return normalized as T;
}

export async function holdedListContacts<T = HoldedContact[]>(
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const qs = buildSearchParams(query);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const payload = await rawHoldedFetch<unknown>(`/contacts${suffix}`);

  if (Array.isArray(payload)) {
    return payload
      .map((item) => normalizeHoldedContact(item))
      .filter((item): item is HoldedContact => Boolean(item?.id)) as T;
  }

  const rows = extractArrayPayload<unknown>(payload);

  return rows
    .map((item) => normalizeHoldedContact(item))
    .filter((item): item is HoldedContact => Boolean(item?.id)) as T;
}