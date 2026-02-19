// src/lib/holded/holdedImportIncrementalRunner.ts
/**
 * VIHOLABS — HOLDed Incremental Import Runner (NO HTTP)
 * + Observability logging (holded_sync_runs)
 *
 * Canon preserved:
 * - Cursor logic untouched
 * - Import logic untouched
 * - Only adds run logging + evidence fields (GitHub Actions)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchChangedIds } from "@/lib/holded/holdedIncremental";
import {
  importOneHoldedInvoiceById,
  type ImportError,
} from "@/lib/holded/holdedInvoiceImporter";

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

export async function runHoldedInvoicesIncrementalImport(
  args: RunHoldedIncrementalArgs
) {
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
    const failures: Array<ImportError & { holded_id: string }> = [];

    for (const holdedId of invoiceIds) {
      const r = await importOneHoldedInvoiceById(supabase, holdedId);
      if (r.ok) imported++;
      else failures.push({ ...r.err, holded_id: holdedId });
    }

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
      advanced: cursorAdvanced,
      cursor: {
        source: cursor_source,
        prev_db_cursor,
        since: since.toISOString(),
        until: until.toISOString(),
      },
    };

    // 2️⃣ UPDATE RUN (success)
    await supabase
      .from("holded_sync_runs")
      .update({
        finished_at: finishedAt.toISOString(),
        ok: true,
        stage: "completed",
        total_ids: invoiceIds.length,
        imported,
        failed: failures.length,
        advanced: cursorAdvanced,
        cursor_source: cursor_source,
        prev_db_cursor: prev_db_cursor,
        since: since.toISOString(),
        until: until.toISOString(),
        payload,
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
