// src/app/api/holded/invoices/hydrated/route.ts
/**
 * VIHOLABS — HOLDed Invoices Hydrated (READ ONLY)
 *
 * Purpose:
 * Return invoices enriched with minimal HOLDed detail (read-only).
 *
 * Invariants:
 * - No DB writes
 * - Internal bearer only (same as other HOLDed admin endpoints)
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { holdedDocumentDetail } from "@/lib/holded/holdedClient";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function requireInternalBearer(req: Request) {
  const expected = String(process.env.VIHOLABS_INTERNAL_BEARER ?? "").trim();
  if (!expected) return { ok: false as const, status: 500, error: "Missing env: VIHOLABS_INTERNAL_BEARER" };

  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false as const, status: 401, error: "Missing Bearer token" };

  const got = String(m[1] ?? "").trim();
  if (got !== expected) return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const };
}

function parseLimit(v: string | null, fallback: number, max = 200): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function GET(req: Request) {
  const auth = requireInternalBearer(req);
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  try {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"), 50, 200);

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, external_invoice_id, total, currency, source_provider")
      .eq("source_provider", "holded")
      .limit(limit);

    if (error) return json(500, { ok: false, stage: "supabase_select", error: error.message });

    const hydrated: any[] = [];
    const errors: any[] = [];

    for (const row of data ?? []) {
      const holdedId = String((row as any)?.external_invoice_id ?? "").trim();
      if (!holdedId) {
        hydrated.push({ ...row, holded: null });
        continue;
      }

      try {
        // Canonical signature: (docType, id)
        const raw = await holdedDocumentDetail<any>("invoice", holdedId);
        const detail = raw as any;

        hydrated.push({
          ...row,
          holded: {
            id: holdedId,
            docNumber: detail?.docNumber ?? null,
            date: detail?.date ?? null,
            total: detail?.total ?? null,
            currency: detail?.currency ?? null,
            status: detail?.status ?? null,
          },
        });
      } catch (e: any) {
        errors.push({
          invoice_id: (row as any)?.id ?? null,
          holded_id: holdedId,
          error: String(e?.message ?? e),
        });
        hydrated.push({ ...row, holded: null });
      }
    }

    return json(200, { ok: true, count: hydrated.length, hydrated, errors });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message ?? e) });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
