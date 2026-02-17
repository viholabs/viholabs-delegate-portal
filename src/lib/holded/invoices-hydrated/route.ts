// src/app/api/holded/invoices-hydrated/route.ts
//
// VIHOLABS — HOLDed invoices list + DETAIL hydration (dates)
// IMPORTANT:
// - Does NOT modify existing /api/holded/invoices endpoint.
// - No heuristics. No fallbacks. Only uses HOLDed DETAIL date if present.
// - Adds deterministic fields: date_resolved_unix, date_resolved_iso.

import { NextRequest, NextResponse } from "next/server";
import { fetchHoldedDocumentDetail } from "@/lib/holded/fetchHoldedDocumentDetail";
import { holdedUnixSecondsToIso } from "@/lib/holded/holdedDate";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getInt(searchParams: URLSearchParams, key: string, def: number) {
  const raw = searchParams.get(key);
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

function getBool(searchParams: URLSearchParams, key: string, def = false) {
  const raw = (searchParams.get(key) || "").trim().toLowerCase();
  if (!raw) return def;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "y";
}

// Minimal concurrency limiter (no deps)
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      results[idx] = await mapper(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

type HoldedListInvoice = {
  holded_id: string;
  number?: string;
  date: any; // list often returns null
  status?: any;
  total?: any;
  currency?: any;
  contact_name?: any;
  // allow extra fields
  [k: string]: any;
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = getInt(url.searchParams, "page", 1);
    const count = getInt(url.searchParams, "count", 20);
    const debug = getBool(url.searchParams, "debug", false);

    const baseUrl = (process.env.HOLDED_BASE_URL || "https://api.holded.com").replace(/\/+$/, "");
    const docType = (process.env.HOLDED_DOC_TYPE || "invoice").trim() || "invoice";
    const apiKey = (process.env.HOLDED_API_KEY || "").trim();

    if (!apiKey) {
      return json(500, {
        ok: false,
        stage: "env",
        error: "Missing HOLDED_API_KEY",
      });
    }

    // 1) HOLDed LIST (known to be incomplete — that is the point)
    const listUrl = `${baseUrl}/api/invoicing/v1/documents/${encodeURIComponent(docType)}?page=${encodeURIComponent(
      String(page)
    )}`;

    const listResp = await fetch(listUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        key: apiKey,
      } as any,
      cache: "no-store",
    });

    const listText = await listResp.text();
    let listData: any = null;
    try {
      listData = listText ? JSON.parse(listText) : null;
    } catch {
      listData = { non_json: true, rawText: listText.slice(0, 1200) };
    }

    if (!listResp.ok) {
      return json(502, {
        ok: false,
        stage: "holded_list",
        error: "HOLDed LIST error",
        http_status: listResp.status,
        url: listUrl,
        sample: listData,
      });
    }

    // HOLDed usually returns an array
    const rawInvoices: HoldedListInvoice[] = Array.isArray(listData) ? listData : [];

    // Apply count limit deterministically (no guessing)
    const invoices = rawInvoices.slice(0, Math.max(0, count));

    // 2) Hydrate via DETAIL for those with date == null (and only if holded_id exists)
    const concurrency = 5; // conservative; deterministic; avoid rate bursts
    const hydrationStartedAt = Date.now();

    const hydrated = await mapWithConcurrency(invoices, concurrency, async (inv) => {
      const holded_id = String(inv?.holded_id || "").trim();
      if (!holded_id) {
        return {
          ...inv,
          date_resolved_unix: null,
          date_resolved_iso: null,
          hydration: { ok: false, reason: "missing_holded_id" },
        };
      }

      // If list already has a numeric date, we still DO NOT transform it here
      // (list is not canonical; we only resolve through DETAIL when needed)
      const needsDetail = inv?.date == null;

      if (!needsDetail) {
        return {
          ...inv,
          date_resolved_unix: null,
          date_resolved_iso: null,
          hydration: { ok: true, reason: "list_has_date_nonnull" },
        };
      }

      const detail = await fetchHoldedDocumentDetail({
        id: holded_id,
        docType,
        baseUrl,
        apiKey,
      });

      if (!detail.ok) {
        return {
          ...inv,
          date_resolved_unix: null,
          date_resolved_iso: null,
          hydration: { ok: false, reason: "detail_error", detail },
        };
      }

      const unixSeconds = detail?.data?.date;
      const iso = holdedUnixSecondsToIso(unixSeconds);

      return {
        ...inv,
        date_resolved_unix: typeof unixSeconds === "number" ? unixSeconds : null,
        date_resolved_iso: iso,
        hydration: { ok: true, reason: "detail_hydrated" },
      };
    });

    const hydrationMs = Date.now() - hydrationStartedAt;

    return json(200, {
      ok: true,
      stage: "ok",
      holded: {
        base_url: baseUrl,
        doc_type: docType,
        page,
        count: invoices.length,
      },
      invoices: hydrated,
      ...(debug
        ? {
            debug: {
              list_url: listUrl,
              list_count_raw: rawInvoices.length,
              hydrated_count: hydrated.length,
              hydration_ms: hydrationMs,
            },
          }
        : {}),
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage: "unexpected",
      error: e?.message ?? "Unexpected error",
    });
  }
}
