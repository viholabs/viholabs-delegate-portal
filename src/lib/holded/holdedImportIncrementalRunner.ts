// src/lib/holded/holdedImportIncrementalRunner.ts
/**
 * VIHOLABS — HOLDed Incremental Import Runner (NO HTTP)
 * + Observability logging (holded_sync_runs)
 *
 * Canon preserved:
 * - Cursor logic untouched
 * - Import logic untouched
 * - Adds deterministic SKIP handling for upstream-corrupt docs (missing docNumber)
 *
 * Rule:
 * - FAILURES (real) block cursor advance
 * - SKIPS do NOT block cursor advance
 *
 * Added (evidence, minimal & deterministic):
 * - When an import fails, we persist a small raw_min snapshot (invoice header + items sketch)
 *   to make root-cause debugging possible for cases like missing holded_contact_id.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchChangedIds } from "@/lib/holded/holdedIncremental";
import {
  importOneHoldedInvoiceById,
  type ImportError,
  type ImportResult,
} from "@/lib/holded/holdedInvoiceImporter";

/**
 * Minimal evidence snapshot to store in holded_sync_runs.payload.failures[].raw_min
 * (do NOT store the full raw invoice object; it can be huge / contain sensitive data)
 */
function pickInvoiceRawMin(inv: any) {
  if (!inv || typeof inv !== "object") return null;

  const contact =
    inv.contactId ??
    inv.contact_id ??
    inv.contact?.id ??
    inv.contact?._id ??
    inv.contact ??
    inv.clientId ??
    inv.client_id ??
    inv.client?.id ??
    inv.client?._id ??
    inv.client ??
    null;

  const number =
    inv.docNumber ??
    inv.doc_number ??
    inv.number ??
    inv.invoiceNumber ??
    inv.invoice_number ??
    inv.name ??
    null;

  const date =
    inv.date ??
    inv.invoiceDate ??
    inv.invoice_date ??
    inv.issuedAt ??
    inv.issued_at ??
    inv.createdAt ??
    inv.created_at ??
    null;

  const items = Array.isArray(inv.items) ? inv.items : Array.isArray(inv.lines) ? inv.lines : null;

  const items_min = items
    ? items.slice(0, 25).map((it: any) => ({
        name: it?.name ?? it?.description ?? it?.desc ?? null,
        units: it?.units ?? it?.quantity ?? it?.qty ?? null,
        sku: it?.sku ?? null,
        holded_product_id: it?.productId ?? it?.product_id ?? it?.product?.id ?? it?.product?._id ?? null,
        holded_variant_id: it?.variantId ?? it?.variant_id ?? it?.variant?.id ?? it?.variant?._id ?? null,
        net: it?.net ?? it?.subtotal ?? it?.amount ?? it?.price ?? null,
      }))
    : null;

  return {
    id: inv.id ?? inv._id ?? null,
    number,
    date,
    contact,
    items_count: items ? items.length : null,
    items_min,
  };
}

function parseLimit(v: unknown, fallback: number, max = 300): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
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

export type RunHoldedIncrementalArgs = {
  limit?: number;
  since?: string;
  until?: string;
};

function isSkip(r: ImportResult): r is { ok: false; skipped: true; err: ImportError } {
  return !!r && (r as any).ok === false && (r as any).skipped === true;
}

type ImportFailureRow = ImportError & {
  holded_id: string;
  raw_min?: ReturnType<typeof pickInvoiceRawMin> | null;
};

type ImportSkipRow = ImportError & {
  holded_id: string;
  raw_min?: ReturnType<typeof pickInvoiceRawMin> | null;
};

export async function runHoldedInvoicesIncrementalImport(args: RunHoldedIncrementalArgs) {
  const startedAt = new Date();
  const limit = parseLimit(args.limit, 50, 300);
  const supabase = supabaseAdmin();

  // Evidence (GitHub Actions provides these env vars)
  const github_run_id = process.env.GITHUB_RUN_ID ? String(process.env.GITHUB_RUN_ID) : null;
  const github_repo = process.env.GITHUB_REPOSITORY ? String(process.env.GITHUB_REPOSITORY) : null;
  const github_sha = process.env.GITHUB_SHA ? String(process.env.GITHUB_SHA) : null;

  // 1️⃣ INSERT RUN (start)
  const { data: runRow, error: runInsertError } = await supabase
    .from("holded_sync_runs")
    .insert({
      job: "holded_invoices_incremental",
      mode: "incremental_stateful_no_http",
      started_at: startedAt.toISOString(),
      ok: false,
      stage: "started",
      limit_n: limit,
      github_run_id,
      github_repo,
      github_sha,
      payload: {},
    })
    .select("id")
    .single();

  if (runInsertError) {
    throw new Error(`holded_sync_runs insert failed: ${runInsertError.message}`);
  }

  const runId = runRow.id;

  try {
    const sinceOverride = args.since ? safeDateOrUndefined(args.since) : undefined;
    const untilOverride = args.until ? safeDateOrUndefined(args.until) : undefined;

    const stateRes = await readHoldedSyncState(supabase);
    if (!stateRes.ok) throw new Error(stateRes.error);

    const state = stateRes.row ?? null;
    const cursorDate = safeDateOrUndefined(state?.last_cursor);

    const until = untilOverride ?? new Date();
    const fallbackSince = new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = sinceOverride ?? cursorDate ?? fallbackSince;

    const cursor_source = sinceOverride ? "override" : cursorDate ? "db" : "fallback_30d";
    const prev_db_cursor = state?.last_cursor ?? null;

    const idsAll = await fetchChangedIds({
      docType: "invoice",
      since,
      until,
    });

    const invoiceIds = idsAll.slice(0, limit);

    let imported = 0;
    let skipped = 0;

    const failures: ImportFailureRow[] = [];
    const skipped_items: ImportSkipRow[] = [];

    for (const holdedId of invoiceIds) {
      const r = await importOneHoldedInvoiceById(supabase, holdedId);

      if (r.ok) {
        imported++;
        continue;
      }

      // Attach minimal evidence if the importer provided it (best-effort).
      const raw_min = pickInvoiceRawMin((r as any)?.raw_invoice ?? (r as any)?.raw ?? null);

      if (isSkip(r)) {
        skipped++;
        skipped_items.push({ ...r.err, holded_id: holdedId, raw_min });
        continue;
      }

      failures.push({ ...(r as any).err, holded_id: holdedId, raw_min });
    }

    // Advance cursor only if no REAL failures.
    let cursorAdvanced = false;

    if (failures.length === 0) {
      const w = await writeHoldedSyncState(supabase, {
        cursorISO: until.toISOString(),
        syncAtISO: until.toISOString(),
      });
      if (!w.ok) throw new Error(w.error);
      cursorAdvanced = true;
    }

    const finishedAt = new Date();

    const payload = {
      ok: true,
      total_ids: invoiceIds.length,
      imported,
      failed: failures.length,
      skipped,
      advanced: cursorAdvanced,
      cursor: {
        source: cursor_source,
        prev_db_cursor,
        since: since.toISOString(),
        until: until.toISOString(),
      },
      failures,
      skipped_items,
    };

    // Canon: FAILURES are real -> ok must be false and stage must be "failed" (not "completed")
    const ok = failures.length === 0;

    // 2️⃣ UPDATE RUN (end)
    await supabase
      .from("holded_sync_runs")
      .update({
        finished_at: finishedAt.toISOString(),
        ok,
        stage: ok ? "completed" : "failed",
        total_ids: invoiceIds.length,
        imported,
        failed: failures.length,
        advanced: cursorAdvanced,
        cursor_source: cursor_source,
        prev_db_cursor: prev_db_cursor,
        since: since.toISOString(),
        until: until.toISOString(),
        payload,
        error_message: ok ? null : "One or more invoice imports failed",
      })
      .eq("id", runId);

    return payload;
  } catch (e: any) {
    const finishedAt = new Date();

    await supabase
      .from("holded_sync_runs")
      .update({
        finished_at: finishedAt.toISOString(),
        ok: false,
        stage: "exception",
        error_message: String(e?.message ?? e),
        payload: { ok: false, error: String(e?.message ?? e) },
      })
      .eq("id", runId);

    throw e;
  }
}