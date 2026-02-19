// src/app/api/holded/invoices/import-incremental/route.ts
/**
 * VIHOLABS — HOLDed Invoices Import (INCREMENTAL, STATEFUL)
 *
 * Canon:
 * - NO UI changes.
 * - Reuse invoice importer (holdedInvoiceImporter.ts) — NO duplication.
 * - Reuse holdedIncremental.ts fetchChangedIds({ docType, since, until }).
 * - Persist cursor in public.holded_sync_state (singleton row id=true):
 *   - last_cursor: ISO timestamp (until.toISOString())
 *   - last_sync_at: timestamptz (until)
 *   - updated_at: timestamptz (now)
 *
 * Cursor advance rule (safe):
 * - If failures > 0, DO NOT advance cursor (avoid skipping failed ids).
 * - If all ok, advance cursor to until.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { tryAcquireLock, releaseLock } from "@/lib/infra/processLock";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { importOneHoldedInvoiceById, type ImportError } from "@/lib/holded/holdedInvoiceImporter";
import { fetchChangedIds } from "@/lib/holded/holdedIncremental";

const IMPORT_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LOCK_KEY = "holded_invoices_import_incremental";

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

function parseLimit(v: string | null, fallback: number, max = 300): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function parseDateParam(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function safeDateOrUndefined(v: unknown): Date | undefined {
  if (!v) return undefined;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) return undefined;
  return d;
}

async function readHoldedSyncState(supabase: ReturnType<typeof supabaseAdmin>) {
  const q = await supabase
    .from("holded_sync_state")
    .select("id,last_sync_at,last_cursor,updated_at")
    .eq("id", true)
    .maybeSingle();

  if (q.error) return { ok: false as const, error: q.error.message };
  return { ok: true as const, row: q.data };
}

async function writeHoldedSyncState(
  supabase: ReturnType<typeof supabaseAdmin>,
  args: { cursorISO: string; syncAtISO: string }
) {
  const upd = await supabase
    .from("holded_sync_state")
    .update({
      last_cursor: args.cursorISO,
      last_sync_at: args.syncAtISO,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (upd.error) return { ok: false as const, error: upd.error.message };
  return { ok: true as const };
}

export async function GET(req: Request) {
  const auth = requireInternalBearer(req);
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  const acquired = tryAcquireLock(IMPORT_LOCK_TTL_MS, LOCK_KEY);
  if (!acquired) return json(409, { ok: false, stage: "busy", error: "Busy (import already running)" });

  const startedAt = new Date().toISOString();

  try {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"), 50, 300);

    // Optional overrides for debugging / replay.
    const sinceOverride = parseDateParam(url.searchParams.get("since"));
    const untilOverride = parseDateParam(url.searchParams.get("until"));

    const supabase = supabaseAdmin();

    // Read cursor from DB (singleton row id=true)
    const stateRes = await readHoldedSyncState(supabase);
    if (!stateRes.ok) return json(500, { ok: false, stage: "read_sync_state", error: stateRes.error });

    const state = stateRes.row ?? null;
    const cursorDate = safeDateOrUndefined(state?.last_cursor);

    const until = untilOverride ?? new Date();
    const fallbackSince = new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = sinceOverride ?? cursorDate ?? fallbackSince;

    const idsAll = await fetchChangedIds({
      docType: "invoice",
      since,
      until,
    });

    const invoiceIds = idsAll.slice(0, limit);

    let imported = 0;
    const failures: Array<ImportError & { holded_id: string }> = [];
    const skipped: Array<{ holded_id: string; reason: string }> = [];

    for (const holdedId of invoiceIds) {
      const r = await importOneHoldedInvoiceById(supabase, holdedId);
      if (r.ok) {
        imported += 1;
        continue;
      }

      const msg = String(r?.err?.error ?? "").toLowerCase();

      // Canonical deterministic skip: HOLDed returns docs with empty/null docNumber (number),
      // which cannot be imported into local truth because invoice_number is required.
      if (msg.includes("missing invoice_number")) {
        skipped.push({ holded_id: holdedId, reason: "missing_invoice_number" });
        continue;
      }

      failures.push({ ...r.err, holded_id: holdedId });
    }

    // Advance cursor only if fully OK.
    let cursorAdvanced = false;

    if (failures.length === 0) {
      const w = await writeHoldedSyncState(supabase, {
        cursorISO: until.toISOString(),
        syncAtISO: until.toISOString(),
      });
      if (!w.ok) {
        return json(500, {
          ok: false,
          stage: "write_sync_state",
          error: w.error,
          imported,
          failed: failures.length,
          failures,
        });
      }
      cursorAdvanced = true;
    }

    const finishedAt = new Date().toISOString();

    return json(200, {
      ok: true,
      mode: "incremental_stateful",
      limit,
      total_ids: invoiceIds.length,
      imported,
      skipped: skipped.length,
      skipped_ids: skipped,
      failed: failures.length,
      failures,
      cursor: {
        source: sinceOverride ? "override" : cursorDate ? "db" : "fallback_30d",
        prev_db_cursor: state?.last_cursor ?? null,
        since: since.toISOString(),
        until: until.toISOString(),
        advanced: cursorAdvanced,
      },
      at: { started: startedAt, finished: finishedAt },
    });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message ?? e) });
  } finally {
    releaseLock(LOCK_KEY);
  }
}

export async function POST(req: Request) {
  return GET(req);
}
