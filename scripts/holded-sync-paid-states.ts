/**
 * VIHOLABS — Holded Full Status Sync
 *
 * Problem this solves:
 *   The incremental import only processes invoices that Holded reports as
 *   "changed". Holded does NOT always flag an invoice when its payment state
 *   changes (e.g. bank reconciliation, CN compensation). Invoices can remain
 *   stale in our DB indefinitely.
 *
 * What this does:
 *   1. Queries ALL Holded invoices in the DB (not just is_paid=false)
 *   2. For each one, fetches the live status from the Holded API
 *   3. Updates is_paid, paid_date, state_code whenever they differ — in BOTH
 *      directions (unpaid→paid AND paid→unpaid, e.g. after a CN reversal)
 *   4. Runs in configurable batches with bounded concurrency to respect API limits
 *
 * Schedule: run every 4 hours via GitHub Actions cron-sync-paid-states.yml
 *
 * Usage:
 *   pnpm exec -- tsx scripts/holded-sync-paid-states.ts
 *
 * Env vars:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL   required
 *   SUPABASE_SERVICE_ROLE_KEY                  required
 *   HOLDED_API_KEY                             required
 *   MAX_ITEMS   max invoices to check per run  (default: 5000)
 *   CONCURRENCY parallel Holded API calls      (default: 8)
 *   PREVIEW     if "true", dry-run (no DB writes)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchHoldedInvoiceDetail, computeHoldedLiveMeta } from "../src/lib/holded/holdedLiveStatus";
import { todayYmdUtc } from "../src/lib/holded/holdedPrimitives";

// ---------------------------------------------------------------------------
// Bootstrap env
// ---------------------------------------------------------------------------

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

function requireEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit = 8
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const supabaseUrl = requireSupabaseUrl();
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const maxItems = parsePositiveInt(process.env.MAX_ITEMS, 5000);
  const concurrency = parsePositiveInt(process.env.CONCURRENCY, 8);
  const preview = String(process.env.PREVIEW ?? "").trim().toLowerCase() === "true";

  console.log("=== VIHOLABS holded-sync-paid-states (full) ===");
  console.log(`  max_items   : ${maxItems}`);
  console.log(`  concurrency : ${concurrency}`);
  console.log(`  preview     : ${preview}`);
  console.log(`  date        : ${todayYmdUtc()}`);
  console.log("");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Load ALL Holded invoices from DB (not just unpaid ones)
  console.log("1) Loading ALL Holded invoices from DB...");
  const { data: allRows, error: queryError } = await supabase
    .from("invoices")
    .select("id, external_invoice_id, is_paid, paid_date, state_code, invoice_number, invoice_date")
    .eq("source_provider", "holded")
    .not("external_invoice_id", "is", null)
    .order("invoice_date", { ascending: false }) // newest first — most likely to have recent changes
    .limit(maxItems);

  if (queryError) throw queryError;

  const rows = (allRows ?? []) as Array<Record<string, any>>;
  console.log(`   found ${rows.length} Holded invoices (limit ${maxItems})`);
  console.log("");

  if (rows.length === 0) {
    console.log("2) Nothing to check. Done.");
    console.log(JSON.stringify({ ok: true, checked: 0, updated: 0, errors: 0, preview }, null, 2));
    return;
  }

  // 2. Check each against Holded live status
  console.log(`2) Checking Holded live status (concurrency=${concurrency})...`);

  type ChangeKind = "now_paid" | "now_unpaid" | "paid_date_changed";

  type CheckResult =
    | {
        invoiceId: string;
        externalId: string;
        invoiceNumber: string;
        change: ChangeKind;
        newIsPaid: boolean;
        newPaidDate: string | null;
      }
    | { invoiceId: string; externalId: string; invoiceNumber: string; noChange: true }
    | { invoiceId: string; externalId: string; invoiceNumber: string; error: string };

  const tasks = rows.map((row) => async (): Promise<CheckResult> => {
    const invoiceId = String(row.id ?? "");
    const externalId = String(row.external_invoice_id ?? "");
    const invoiceNumber = String(row.invoice_number ?? externalId);
    const dbIsPaid = row.is_paid === true;
    const dbPaidDate = row.paid_date ?? null;

    try {
      const detail = await fetchHoldedInvoiceDetail(externalId);
      if (!detail) {
        return { invoiceId, externalId, invoiceNumber, noChange: true };
      }
      const meta = computeHoldedLiveMeta(detail, null);

      const paidChanged = meta.is_paid !== dbIsPaid;
      const dateChanged = meta.is_paid && meta.paid_date !== dbPaidDate;

      if (!paidChanged && !dateChanged) {
        return { invoiceId, externalId, invoiceNumber, noChange: true };
      }

      let change: ChangeKind;
      if (paidChanged && meta.is_paid) {
        change = "now_paid";
        console.log(`   PAID   :: ${invoiceNumber} :: paid_date=${meta.paid_date ?? "?"}`);
      } else if (paidChanged && !meta.is_paid) {
        change = "now_unpaid";
        console.log(`   UNPAID :: ${invoiceNumber} :: was paid, Holded shows unpaid`);
      } else {
        change = "paid_date_changed";
        console.log(`   DATE   :: ${invoiceNumber} :: paid_date ${dbPaidDate} → ${meta.paid_date}`);
      }

      return {
        invoiceId,
        externalId,
        invoiceNumber,
        change,
        newIsPaid: meta.is_paid,
        newPaidDate: meta.paid_date,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`   error  :: ${invoiceNumber} :: ${externalId} :: ${message}`);
      return { invoiceId, externalId, invoiceNumber, error: message };
    }
  });

  const results = await runWithConcurrencyLimit(tasks, concurrency);

  const changed = results.filter(
    (r): r is Extract<CheckResult, { change: ChangeKind }> => "change" in r
  );
  const errors = results.filter(
    (r): r is Extract<CheckResult, { error: string }> => "error" in r
  );
  const noChange = results.filter((r) => "noChange" in r).length;

  console.log("");
  console.log(`   checked    : ${results.length}`);
  console.log(`   no_change  : ${noChange}`);
  console.log(`   to_update  : ${changed.length}`);
  console.log(`     now_paid        : ${changed.filter((c) => c.change === "now_paid").length}`);
  console.log(`     now_unpaid      : ${changed.filter((c) => c.change === "now_unpaid").length}`);
  console.log(`     paid_date_delta : ${changed.filter((c) => c.change === "paid_date_changed").length}`);
  console.log(`   errors     : ${errors.length}`);
  console.log("");

  if (changed.length === 0) {
    console.log("3) No state changes needed. Done.");
    console.log(
      JSON.stringify({ ok: true, checked: results.length, updated: 0, errors: errors.length, preview }, null, 2)
    );
    return;
  }

  // 3. Update DB
  console.log(`3) Updating ${changed.length} invoices${preview ? " (PREVIEW — skipped)" : ""}...`);

  let updated = 0;
  let updateErrors = 0;

  if (!preview) {
    for (const item of changed) {
      const patch: Record<string, unknown> = {
        is_paid: item.newIsPaid,
        state_code: item.newIsPaid ? "SETTLED" : "OPEN",
        paid_date: item.newIsPaid ? (item.newPaidDate ?? todayYmdUtc()) : null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from("invoices")
        .update(patch)
        .eq("id", item.invoiceId);

      if (updateErr) {
        console.error(`   update_error :: ${item.invoiceNumber} :: ${item.invoiceId} :: ${updateErr.message}`);
        updateErrors += 1;
      } else {
        console.log(`   updated :: ${item.invoiceNumber} :: is_paid=${item.newIsPaid} paid_date=${item.newPaidDate ?? "null"}`);
        updated += 1;
      }
    }
  }

  console.log("");
  const summary = {
    ok: true,
    date: todayYmdUtc(),
    checked: results.length,
    changed_in_holded: changed.length,
    updated_in_db: preview ? "(preview)" : updated,
    update_errors: updateErrors,
    holded_api_errors: errors.length,
    breakdown: {
      now_paid: changed.filter((c) => c.change === "now_paid").length,
      now_unpaid: changed.filter((c) => c.change === "now_unpaid").length,
      paid_date_changed: changed.filter((c) => c.change === "paid_date_changed").length,
    },
    preview,
  };
  console.log("=== RESULT ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e: unknown) => {
  console.error("");
  console.error("FATAL ERROR");
  console.error(e);
  process.exit(1);
});
