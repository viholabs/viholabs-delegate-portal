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

async function holdedFetch<T>(
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
        // Holded API key auth (as per Holded docs examples)
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

/* ===========================
   DOCUMENTS (CANONICAL)
   =========================== */

export async function holdedListDocuments<T = unknown>(
  docType: string,
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const qs = new URLSearchParams();

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined) qs.set(k, String(v));
    }
  }

  const suffix = qs.toString() ? `?${qs}` : "";

  return holdedFetch<T>(`/documents/${encodeURIComponent(docType)}${suffix}`);
}

export async function holdedDocumentDetail<T = unknown>(
  docType: string,
  id: string
): Promise<T> {
  if (!id) throw new HoldedClientError("Missing Holded document id", null);

  return holdedFetch<T>(
    `/documents/${encodeURIComponent(docType)}/${encodeURIComponent(id)}`
  );
}

/* ===========================
   CONTACTS (CANONICAL)
   Holded docs: /api/invoicing/v1/contacts/{contactId}
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

  return holdedFetch<T>(`/contacts/${encodeURIComponent(id)}`);
}

export async function holdedListContacts<T = HoldedContact[]>(
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const qs = new URLSearchParams();

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined) qs.set(k, String(v));
    }
  }

  const suffix = qs.toString() ? `?${qs}` : "";

  return holdedFetch<T>(`/contacts${suffix}`);
}
