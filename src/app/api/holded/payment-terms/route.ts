// src/app/api/holded/payment-terms/route.ts

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HoldedDocumentRow = Record<string, unknown>;

type PaymentTermItem = {
  id: string;
  name: string;
  days: number;
};

type ExtractedCandidate = {
  id: string;
  name: string;
  days: number;
};

function getHoldedApiKey(): string {
  const candidates = [
    process.env.HOLDED_API_KEY,
    process.env.HOLDED_APIKEY,
    process.env.NEXT_PRIVATE_HOLDED_API_KEY,
    process.env.HOLDED_KEY,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  throw new Error(
    "Missing Holded API key. Expected one of: HOLDED_API_KEY, HOLDED_APIKEY, NEXT_PRIVATE_HOLDED_API_KEY, HOLDED_KEY"
  );
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function parseDateLike(value: unknown): Date | null {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    // Epoch seconds or milliseconds
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  // Native ISO parse first
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) {
    return native;
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function diffDaysUtc(a: Date, b: Date): number {
  const ms = startOfUtcDay(b) - startOfUtcDay(a);
  return Math.round(ms / 86_400_000);
}

function buildLabelFromDays(days: number): string {
  if (days === 0) return "Vence mismo día";
  if (days === 1) return "1 día";
  return `${days} días`;
}

function uniqueByDays(items: ExtractedCandidate[]): PaymentTermItem[] {
  const map = new Map<number, PaymentTermItem>();

  for (const item of items) {
    if (!map.has(item.days)) {
      map.set(item.days, {
        id: item.id,
        name: item.name,
        days: item.days,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.days - b.days);
}

function pickFirstDate(
  row: HoldedDocumentRow,
  keys: string[]
): Date | null {
  for (const key of keys) {
    const parsed = parseDateLike(row[key]);
    if (parsed) return parsed;
  }
  return null;
}

function extractPaymentTermFromDocument(
  row: HoldedDocumentRow
): ExtractedCandidate | null {
  // Possible issue/creation date fields
  const issueDate = pickFirstDate(row, [
    "date",
    "issueDate",
    "issue_date",
    "createdAt",
    "created_at",
  ]);

  // Possible due date fields
  const dueDate = pickFirstDate(row, [
    "dueDate",
    "due_date",
    "expirationDate",
    "expiration_date",
    "paymentDueDate",
    "payment_due_date",
  ]);

  if (!issueDate || !dueDate) {
    return null;
  }

  const days = diffDaysUtc(issueDate, dueDate);

  if (!Number.isFinite(days) || days < 0 || days > 3650) {
    return null;
  }

  return {
    id: `days-${days}`,
    name: buildLabelFromDays(days),
    days,
  };
}

async function fetchHoldedDocuments(
  apiKey: string
): Promise<HoldedDocumentRow[]> {
  const response = await fetch(
    "https://api.holded.com/api/invoicing/v1/documents",
    {
      method: "GET",
      headers: {
        accept: "application/json",
        key: apiKey,
      },
      cache: "no-store",
    }
  );

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(
      `Holded documents request failed (${response.status}): ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`
    );
  }

  if (Array.isArray(payload)) {
    return payload as HoldedDocumentRow[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: HoldedDocumentRow[] }).data;
  }

  return [];
}

export async function GET() {
  try {
    const apiKey = getHoldedApiKey();
    const documents = await fetchHoldedDocuments(apiKey);

    const extracted = documents
      .map((row) => extractPaymentTermFromDocument(row))
      .filter((item): item is ExtractedCandidate => item !== null);

    const terms = uniqueByDays(extracted);

    return NextResponse.json(
      {
        ok: true,
        data: terms,
        meta: {
          source: "holded-live-inference-from-documents",
          documents_scanned: documents.length,
          terms_found: terms.length,
          canonical_note:
            "Derived from live Holded documents by calculating issue date -> due date differences. No local hardcoded catalog.",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
        data: [],
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}