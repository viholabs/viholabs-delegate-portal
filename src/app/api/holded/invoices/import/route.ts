// src/app/api/holded/invoices/import/route.ts
/**
 * VIHOLABS — HOLDed Invoices Import (LEGACY / BATCH)
 *
 * AUDIT TRACE
 * Date: 2026-02-16
 * Reason: Supabase error: "no unique or exclusion constraint matching ON CONFLICT"
 * Scope: Remove ON CONFLICT upsert; implement manual lookup+update/insert.
 * No UI changes. No schema changes.
 *
 * HARDENING (2026-02-17):
 * - Concurrency guard (process lock) to prevent parallel imports under load (best-effort).
 * - Idempotency hardening: resolve duplicates against DB unique (source_provider, invoice_number).
 *   If external_invoice_id is new but invoice_number already exists for same provider -> UPDATE instead of INSERT.
 * - No changes to economic semantics.
 *
 * REFACTOR (2026-02-17):
 * - Reuse single-invoice importer from src/lib/holded/holdedInvoiceImporter.ts
 * - This endpoint keeps behavior identical: list IDs (legacy) then import one-by-one.
 *
 * QUIRURGIC ADD (2026-02-17):
 * - Optional ?id=HOLDED_ID to import exactly ONE invoice (deterministic verification).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { tryAcquireLock, releaseLock } from "@/lib/infra/processLock";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  importOneHoldedInvoiceById,
  listHoldedInvoiceIds,
  type ImportError,
} from "@/lib/holded/holdedInvoiceImporter";

// Import lock TTL: import can take time under load.
// Prevent storm / overlaps; recover if stale.
const IMPORT_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function parseLimit(v: string | null, fallback: number, max = 200): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function parseId(v: string | null): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

async function runImport(limit: number) {
  const supabase = supabaseAdmin();

  // IMPORTANT: listHoldedInvoiceIds returns string[] (legacy list)
  const ids = await listHoldedInvoiceIds(limit);

  let imported = 0;
  const errors: ImportError[] = [];

  for (const id of ids) {
    const r = await importOneHoldedInvoiceById(supabase, id);
    if (r.ok) imported += 1;
    else errors.push(r.err);
  }

  return { imported_count: imported, error_count: errors.length, errors };
}

async function runImportOneById(holdedId: string) {
  const supabase = supabaseAdmin();

  const r = await importOneHoldedInvoiceById(supabase, holdedId);
  if (r.ok) {
    return { imported_count: 1, error_count: 0, errors: [] as ImportError[] };
  }
  return { imported_count: 0, error_count: 1, errors: [r.err] as ImportError[] };
}

export async function GET(req: Request) {
  // Concurrency guard at entry-point (before fetch/supabase) — best-effort.
  const acquired = tryAcquireLock(IMPORT_LOCK_TTL_MS, "holded_invoices_import");
  if (!acquired) {
    return json(409, { ok: false, stage: "busy", error: "Busy (import already running)" });
  }

  try {
    const url = new URL(req.url);

    // QUIRURGIC: import exactly one invoice by Holded id (for deterministic verification)
    const oneId = parseId(url.searchParams.get("id"));
    if (oneId) {
      const out = await runImportOneById(oneId);
      return json(200, { ok: out.error_count === 0, mode: "single", id: oneId, ...out });
    }

    // Legacy batch mode
    const limit = parseLimit(url.searchParams.get("limit"), 20, 200);
    const out = await runImport(limit);
    return json(200, { ok: true, mode: "batch", limit, ...out });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message ?? e) });
  } finally {
    releaseLock("holded_invoices_import");
  }
}

// POST compatibility for tunnels
export async function POST(req: Request) {
  return GET(req);
}
