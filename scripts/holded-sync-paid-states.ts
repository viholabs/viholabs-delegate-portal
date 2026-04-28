/**
 * VIHOLABS — Holded Paid-State Sync
 *
 * Problem this solves:
 *   The incremental import only processes invoices that Holded reports as "changed".
 *   Holded does NOT mark an invoice as changed when:
 *     a) A payment is recorded via bank reconciliation (giro/remesa/transferencia)
 *     b) A credit note (CN) is created that cancels the invoice
 *
 *   In both cases the DETAIL endpoint shows paymentsTotal=0 / paymentsPending=full,
 *   so the old detail-only check missed them entirely.
 *
 * What this does:
 *   1. Queries the DB for all non-settled, unpaid, non-CN Holded invoices
 *   2. Fetches the Holded invoice LIST once for the full date range (has true status)
 *   3. For each invoice: checks list status first (paid/anulado), then falls back
 *      to detail endpoint (paymentsTotal/paymentsPending)
 *   4. Updates DB accordingly:
 *      - paid     → is_paid=true,  state_code=SETTLED, paid_date
 *      - anulado  → is_paid=false, state_code=SETTLED  (cancelled via CN, not paid)
 *
 * Schedule: every 4 hours via GitHub Actions cron-sync-paid-states.yml
 *
 * Env vars:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL   required
 *   SUPABASE_SERVICE_ROLE_KEY                  required
 *   HOLDED_API_KEY                             required
 *   MAX_ITEMS   max invoices to check per run  (default: 500)
 *   PREVIEW     if "true", dry-run (no DB writes)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchHoldedInvoiceDetail, computeHoldedLiveMeta } from "../src/lib/holded/holdedLiveStatus";
import { holdedListDocuments } from "../src/lib/holded/holdedClient";
import { todayYmdUtc } from "../src/lib/holded/holdedPrimitives";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const EPSILON = 0.02;

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

function resolveListStatus(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim().toLowerCase();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const map: Record<number, string> = { 0: "draft", 1: "pending", 2: "paid", 3: "pending", 4: "overdue", 5: "anulado" };
    return map[raw] ?? String(raw);
  }
  return null;
}

function isListPaid(s: string | null): boolean {
  if (!s) return false;
  return ["paid", "pagado", "cobrado", "closed", "settled", "collected"].includes(s);
}

function isListCancelled(s: string | null): boolean {
  if (!s) return false;
  return ["anulado", "anulada", "cancelled", "canceled", "void", "voided"].includes(s);
}

function unixToDateYmd(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 9_999_999_999 ? v : v * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return unixToDateYmd(n);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
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

async function main(): Promise<void> {
  const supabaseUrl = requireSupabaseUrl();
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const maxItems = parsePositiveInt(process.env.MAX_ITEMS, 500);
  const preview = String(process.env.PREVIEW ?? "").trim().toLowerCase() === "true";

  console.log("=== VIHOLABS holded-sync-paid-states ===");
  console.log(`  max_items  : ${maxItems}`);
  console.log(`  preview    : ${preview}`);
  console.log(`  date       : ${todayYmdUtc()}`);
  console.log("");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Load open unpaid Holded invoices (exclude CNs and already-settled)
  console.log("1) Loading open unpaid Holded invoices from DB...");
  const { data: unpaidRows, error: queryError } = await supabase
    .from("invoices")
    .select("id, external_invoice_id, paid_date, state_code, invoice_number, invoice_date, total_gross")
    .eq("source_provider", "holded")
    .eq("is_paid", false)
    .neq("state_code", "SETTLED")
    .neq("document_type", "creditnote")
    .not("external_invoice_id", "is", null)
    .order("invoice_date", { ascending: true })
    .limit(maxItems);

  if (queryError) throw queryError;

  const rows = (unpaidRows ?? []) as Array<Record<string, any>>;
  console.log(`   found ${rows.length} open unpaid Holded invoices (limit ${maxItems})`);
  console.log("");

  if (rows.length === 0) {
    console.log("2) Nothing to check. Done.");
    console.log(JSON.stringify({ ok: true, checked: 0, updated: 0, errors: 0, preview }, null, 2));
    return;
  }

  // 2. Fetch Holded LIST once for the date range — this is the reliable source for paid/anulado
  console.log("2) Fetching Holded invoice LIST (source of truth for paid/anulado status)...");

  type ListEntry = { status: string | null; listDate: string | null };
  const holdedListMap = new Map<string, ListEntry>();
  let listFetchError: string | null = null;

  try {
    const sortedDates = rows
      .map((r) => r.invoice_date as string)
      .filter(Boolean)
      .sort();
    const oldestDate = new Date(sortedDates[0] ?? todayYmdUtc());
    oldestDate.setDate(oldestDate.getDate() - 7);
    const startDate = oldestDate.toISOString().slice(0, 10);
    const endDate = todayYmdUtc();

    console.log(`   date range: ${startDate} → ${endDate}`);

    const listRows = await holdedListDocuments<Record<string, unknown>[]>("invoice", {
      startDate,
      endDate,
    });

    for (const row of listRows ?? []) {
      const id = String(row.id ?? row._id ?? "").trim();
      if (!id) continue;
      const status = resolveListStatus(row.status ?? row.docStatus);
      const listDate = unixToDateYmd(row.billDate ?? row.paymentDate ?? row.lastPaymentDate) ?? null;
      holdedListMap.set(id, { status, listDate });
    }

    console.log(`   list loaded: ${holdedListMap.size} entries`);
  } catch (e: unknown) {
    listFetchError = String(e);
    console.warn(`   WARNING: list fetch failed: ${listFetchError}`);
    console.warn(`   Falling back to detail-only check`);
  }

  console.log("");

  // 3. Evaluate each invoice
  console.log("3) Checking each invoice (list status + detail endpoint)...");

  type CheckResult =
    | { kind: "paid";      invoiceId: string; externalId: string; invoiceNumber: string; paidDate: string | null }
    | { kind: "cancelled"; invoiceId: string; externalId: string; invoiceNumber: string }
    | { kind: "open";      invoiceId: string; externalId: string; invoiceNumber: string }
    | { kind: "error";     invoiceId: string; externalId: string; invoiceNumber: string; error: string };

  const tasks = rows.map((row) => async (): Promise<CheckResult> => {
    const invoiceId = String(row.id ?? "");
    const externalId = String(row.external_invoice_id ?? "");
    const invoiceNumber = String(row.invoice_number ?? externalId);
    const totalGross = parseFloat(row.total_gross) || 0;

    try {
      // Check LIST status first — reliable for bank payments and CN cancellations
      const listEntry = holdedListMap.get(externalId);
      const listStatus = listEntry?.status ?? null;
      const isPaidByList = isListPaid(listStatus);
      const isCancelledByList = isListCancelled(listStatus);

      if (isCancelledByList) {
        console.log(`   ANULADO :: ${invoiceNumber} :: status=${listStatus}`);
        return { kind: "cancelled", invoiceId, externalId, invoiceNumber };
      }

      // Fetch detail for paid_date and confirmation
      const detail = await fetchHoldedInvoiceDetail(externalId);
      const meta = detail ? computeHoldedLiveMeta(detail, null) : null;
      const isPaidByDetail = meta?.is_paid ?? false;

      // Also check if paymentsTotal covers the amount (extra safety net)
      let isPaidByPayments = false;
      if (detail) {
        const paymentsTotal = parseFloat(String(detail["paymentsTotal"] ?? "0")) || 0;
        const paymentsPending = parseFloat(String(detail["paymentsPending"] ?? String(totalGross))) || 0;
        isPaidByPayments = (paymentsTotal >= totalGross - EPSILON) || (paymentsPending <= EPSILON);
      }

      if (isPaidByList || isPaidByDetail || isPaidByPayments) {
        const paidDate = meta?.paid_date ?? listEntry?.listDate ?? null;
        console.log(`   PAID    :: ${invoiceNumber} :: paid_date=${paidDate ?? "unknown"} source=${isPaidByList ? "list" : isPaidByDetail ? "detail" : "payments"}`);
        return { kind: "paid", invoiceId, externalId, invoiceNumber, paidDate };
      }

      console.log(`   open    :: ${invoiceNumber} :: list_status=${listStatus ?? "–"}`);
      return { kind: "open", invoiceId, externalId, invoiceNumber };

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`   error   :: ${invoiceNumber} :: ${externalId} :: ${message}`);
      return { kind: "error", invoiceId, externalId, invoiceNumber, error: message };
    }
  });

  const results = await runWithConcurrencyLimit(tasks, 8);

  const paid = results.filter((r): r is Extract<CheckResult, { kind: "paid" }> => r.kind === "paid");
  const cancelled = results.filter((r): r is Extract<CheckResult, { kind: "cancelled" }> => r.kind === "cancelled");
  const errors = results.filter((r): r is Extract<CheckResult, { kind: "error" }> => r.kind === "error");
  const toSettle = [...paid, ...cancelled];

  console.log("");
  console.log(`   checked   : ${results.length}`);
  console.log(`   paid      : ${paid.length}`);
  console.log(`   cancelled : ${cancelled.length}`);
  console.log(`   errors    : ${errors.length}`);
  console.log("");

  if (toSettle.length === 0) {
    console.log("4) No state changes needed. Done.");
    console.log(JSON.stringify({
      ok: true,
      date: todayYmdUtc(),
      checked: results.length,
      settled_paid: 0,
      settled_cancelled: 0,
      updated: 0,
      errors: errors.length,
      list_map_size: holdedListMap.size,
      list_fetch_error: listFetchError,
      preview,
    }, null, 2));
    return;
  }

  // 4. Update DB
  console.log(`4) Updating ${toSettle.length} invoices${preview ? " (PREVIEW — skipped)" : ""}...`);

  let updated = 0;
  let updateErrors = 0;
  const now = new Date().toISOString();

  if (!preview) {
    for (const result of toSettle) {
      const isPaid = result.kind === "paid";
      const paidDate = isPaid ? (result as Extract<CheckResult, { kind: "paid" }>).paidDate : null;

      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          is_paid: isPaid,
          state_code: "SETTLED",
          paid_date: isPaid ? (paidDate ?? todayYmdUtc()) : null,
          needs_review: isPaid && !paidDate,
          updated_at: now,
        })
        .eq("id", result.invoiceId);

      if (updateErr) {
        console.error(`   update_error :: ${result.invoiceNumber} :: ${result.invoiceId} :: ${updateErr.message}`);
        updateErrors += 1;
      } else {
        console.log(`   updated :: ${result.invoiceNumber} :: ${result.kind}`);
        updated += 1;
      }
    }
  }

  console.log("");
  const summary = {
    ok: true,
    date: todayYmdUtc(),
    checked: results.length,
    settled_paid: paid.length,
    settled_cancelled: cancelled.length,
    updated_in_db: preview ? "(preview)" : updated,
    update_errors: updateErrors,
    holded_api_errors: errors.length,
    list_map_size: holdedListMap.size,
    list_fetch_error: listFetchError,
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
