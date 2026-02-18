// src/lib/holded/holdedImportIncrementalRunner.ts
/**
 * VIHOLABS — HOLDed Incremental Import Runner (NO HTTP)
 *
 * Canon:
 * - Same logic as /api/holded/invoices/import-incremental/route.ts
 * - No NextRequest / NextResponse dependency
 * - Uses supabaseAdmin() + holdedIncremental + holdedInvoiceImporter
 * - No schema changes
 * - Deterministic, infra-only
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchChangedIds } from "@/lib/holded/holdedIncremental";
import { importOneHoldedInvoiceById, type ImportError } from "@/lib/holded/holdedInvoiceImporter";

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
  // optional overrides (ISO date strings)
  since?: string;
  until?: string;
};

export type RunHoldedIncrementalResult = {
  ok: boolean;
  mode: "incremental_stateful_no_http";
  limit: number;
  total_ids: number;
  imported: number;
  failed: number;
  failures: Array<ImportError & { holded_id: string }>;
  cursor: {
    source: "override" | "db" | "fallback_30d";
    prev_db_cursor: string | null;
    since: string;
    until: string;
    advanced: boolean;
  };
  at: { started: string; finished: string };
  error?: string;
  stage?: string;
};

export async function runHoldedInvoicesIncrementalImport(
  args: RunHoldedIncrementalArgs
): Promise<RunHoldedIncrementalResult> {
  const startedAt = new Date().toISOString();
  const limit = parseLimit(args.limit, 50, 300);

  try {
    const sinceOverride = args.since ? safeDateOrUndefined(args.since) : undefined;
    const untilOverride = args.until ? safeDateOrUndefined(args.until) : undefined;

    const supabase = supabaseAdmin();

    const stateRes = await readHoldedSyncState(supabase);
    if (!stateRes.ok) {
      return {
        ok: false,
        mode: "incremental_stateful_no_http",
        limit,
        total_ids: 0,
        imported: 0,
        failed: 0,
        failures: [],
        cursor: {
          source: "fallback_30d",
          prev_db_cursor: null,
          since: "",
          until: "",
          advanced: false,
        },
        at: { started: startedAt, finished: new Date().toISOString() },
        stage: "read_sync_state",
        error: stateRes.error,
      };
    }

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

    for (const holdedId of invoiceIds) {
      const r = await importOneHoldedInvoiceById(supabase, holdedId);
      if (r.ok) imported += 1;
      else failures.push({ ...r.err, holded_id: holdedId });
    }

    // Advance cursor only if fully OK.
    let cursorAdvanced = false;

    if (failures.length === 0) {
      const w = await writeHoldedSyncState(supabase, {
        cursorISO: until.toISOString(),
        syncAtISO: until.toISOString(),
      });
      if (!w.ok) {
        return {
          ok: false,
          mode: "incremental_stateful_no_http",
          limit,
          total_ids: invoiceIds.length,
          imported,
          failed: failures.length,
          failures,
          cursor: {
            source: sinceOverride ? "override" : cursorDate ? "db" : "fallback_30d",
            prev_db_cursor: state?.last_cursor ?? null,
            since: since.toISOString(),
            until: until.toISOString(),
            advanced: false,
          },
          at: { started: startedAt, finished: new Date().toISOString() },
          stage: "write_sync_state",
          error: w.error,
        };
      }
      cursorAdvanced = true;
    }

    const finishedAt = new Date().toISOString();

    return {
      ok: true,
      mode: "incremental_stateful_no_http",
      limit,
      total_ids: invoiceIds.length,
      imported,
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
    };
  } catch (e: any) {
    return {
      ok: false,
      mode: "incremental_stateful_no_http",
      limit,
      total_ids: 0,
      imported: 0,
      failed: 0,
      failures: [],
      cursor: {
        source: "fallback_30d",
        prev_db_cursor: null,
        since: "",
        until: "",
        advanced: false,
      },
      at: { started: startedAt, finished: new Date().toISOString() },
      stage: "exception",
      error: String(e?.message ?? e),
    };
  }
}
