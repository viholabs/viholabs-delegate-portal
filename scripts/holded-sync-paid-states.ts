/**
 * VIHOLABS — Holded Paid-State Sync
 *
 * Problem this solves:
 *   The incremental import (holded-import-incremental.ts) only processes
 *   invoices that Holded reports as "changed". Holded does NOT always mark
 *   an invoice as changed when a payment is recorded via a separate bank
 *   transaction (e.g. sepa transfer reconciled later). This means an invoice
 *   can remain is_paid=false in our DB even though Holded shows it as paid.
 *
 * What this does:
 *   1. Queries the DB for all invoices with is_paid=false and source=holded
 *   2. For each one, calls the Holded live-status API
 *   3. If Holded confirms payment: updates is_paid, paid_date, state_code in DB
 *   4. Runs in batches (MAX_ITEMS, default 200) to stay within API rate limits
 *   5. Concurrency limited to 8 parallel Holded calls
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
 *   MAX_ITEMS   max invoices to check per run  (default: 200)
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

  const maxItems = parsePositiveInt(process.env.MAX_ITEMS, 200);
  const preview = String(process.env.PREVIEW ?? "").trim().toLowerCase() === "true";

  console.log("=== VIHOLABS holded-sync-paid-states ===");
  console.log(`  max_items  : ${maxItems}`);
  console.log(`  preview    : ${preview}`);
  console.log(`  date       : ${todayYmdUtc()}`);
  console.log("");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Load unpaid Holded invoices from DB
  console.log("1) Loading unpaid Holded invoices from DB...");
  const { data: unpaidRows, error: queryError } = await supabase
    .from("invoices")
    .select("id, external_invoice_id, paid_date, state_code, invoice_number, invoice_date")
    .eq("source_provider", "holded")
    .eq("is_paid", false)
    .not("external_invoice_id", "is", null)
    .order("invoice_date", { ascending: true }) // oldest first — most likely to have been paid
    .limit(maxItems);

  if (queryError) throw queryError;

  const rows = (unpaidRows ?? []) as Array<Record<string, any>>;
  console.log(`   found ${rows.length} unpaid Holded invoices (limit ${maxItems})`);
  console.log("");

  if (rows.length === 0) {
    console.log("2) Nothing to check. Done.");
    console.log(JSON.stringify({ ok: true, checked: 0, updated: 0, errors: 0, preview }, null, 2));
    return;
  }

  // 2. Check each against Holded live status
  console.log("2) Checking Holded live status (concurrency=8)...");

  type CheckResult =
    | { invoiceId: string; externalId: string; invoiceNumber: string; isPaid: true; paidDate: string | null }
    | { invoiceId: string; externalId: string; invoiceNumber: string; isPaid: false }
    | { invoiceId: string; externalId: string; invoiceNumber: string; error: string };

  const tasks = rows.map((row) => async (): Promise<CheckResult> => {
    const invoiceId = String(row.id ?? "");
    const externalId = String(row.external_invoice_id ?? "");
    const invoiceNumber = String(row.invoice_number ?? externalId);

    try {
      const detail = await fetchHoldedInvoiceDetail(externalId);
      if (!detail) {
        return { invoiceId, externalId, invoiceNumber, isPaid: false };
      }
      const meta = computeHoldedLiveMeta(detail, null);
      if (meta.is_paid) {
        console.log(`   PAID   :: ${invoiceNumber} :: ${externalId} :: paid_date=${meta.paid_date ?? "unknown"}`);
        return { invoiceId, externalId, invoiceNumber, isPaid: true, paidDate: meta.paid_date };
      }
      console.log(`   unpaid :: ${invoiceNumber} :: ${externalId}`);
      return { invoiceId, externalId, invoiceNumber, isPaid: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`   error  :: ${invoiceNumber} :: ${externalId} :: ${message}`);
      return { invoiceId, externalId, invoiceNumber, error: message };
    }
  });

  const results = await runWithConcurrencyLimit(tasks, 8);

  const nowPaid = results.filter((r): r is Extract<CheckResult, { isPaid: true }> =>
    "isPaid" in r && r.isPaid === true
  );
  const errors = results.filter((r): r is Extract<CheckResult, { error: string }> =>
    "error" in r
  );

  console.log("");
  console.log(`   checked  : ${results.length}`);
  console.log(`   now_paid : ${nowPaid.length}`);
  console.log(`   errors   : ${errors.length}`);
  console.log("");

  if (nowPaid.length === 0) {
    console.log("3) No state changes needed. Done.");
    console.log(
      JSON.stringify({ ok: true, checked: results.length, updated: 0, errors: errors.length, preview }, null, 2)
    );
    return;
  }

  // 3. Update DB
  console.log(`3) Updating ${nowPaid.length} invoices to is_paid=true${preview ? " (PREVIEW — skipped)" : ""}...`);

  let updated = 0;
  let updateErrors = 0;

  if (!preview) {
    for (const { invoiceId, invoiceNumber, paidDate } of nowPaid) {
      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          is_paid: true,
          state_code: "SETTLED",
          paid_date: paidDate ?? todayYmdUtc(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateErr) {
        console.error(`   update_error :: ${invoiceNumber} :: ${invoiceId} :: ${updateErr.message}`);
        updateErrors += 1;
      } else {
        console.log(`   updated :: ${invoiceNumber} :: ${invoiceId}`);
        updated += 1;
      }
    }
  }

  console.log("");
  const summary = {
    ok: true,
    date: todayYmdUtc(),
    checked: results.length,
    now_paid_in_holded: nowPaid.length,
    updated_in_db: preview ? "(preview)" : updated,
    update_errors: updateErrors,
    holded_api_errors: errors.length,
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
