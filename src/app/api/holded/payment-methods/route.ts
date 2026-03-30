// src/app/api/holded/payment-methods/route.ts

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HoldedPaymentMethodRaw = {
  id?: unknown;
  _id?: unknown;
  name?: unknown;
  title?: unknown;
  value?: unknown;
  label?: unknown;
  [key: string]: unknown;
};

type PaymentMethodItem = {
  id: string;
  name: string;
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

function normalizePaymentMethod(
  raw: HoldedPaymentMethodRaw
): PaymentMethodItem | null {
  const id = asString(raw.id) || asString(raw._id);
  const name =
    asString(raw.name) ||
    asString(raw.title) ||
    asString(raw.label) ||
    asString(raw.value);

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

function dedupeById(items: PaymentMethodItem[]): PaymentMethodItem[] {
  const map = new Map<string, PaymentMethodItem>();

  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
      continue;
    }

    const current = map.get(item.id)!;
    if (!current.name && item.name) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

export async function GET() {
  try {
    const apiKey = getHoldedApiKey();

    const response = await fetch(
      "https://api.holded.com/api/invoicing/v1/paymentmethods",
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
      return NextResponse.json(
        {
          ok: false,
          error: "Holded payment methods request failed",
          status: response.status,
          details:
            typeof payload === "string"
              ? payload
              : payload && typeof payload === "object"
              ? payload
              : null,
        },
        {
          status: response.status,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data ?? [])
      : [];

    const normalized = dedupeById(
      rows
        .map((row) =>
          normalizePaymentMethod(row as HoldedPaymentMethodRaw)
        )
        .filter((item): item is PaymentMethodItem => item !== null)
    ).sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    );

    return NextResponse.json(
      {
        ok: true,
        data: normalized,
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