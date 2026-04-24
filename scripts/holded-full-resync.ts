/**
 * VIHOLABS — Holded Full Resync
 *
 * Problem this solves:
 *   The incremental import (every 15 min) only processes documents that
 *   Holded flags as "changed" in its /changes API within a rolling date window.
 *   Holded does NOT reliably update a document's modification timestamp when
 *   payment status changes (e.g. bank reconciliation, CN compensation).
 *   Result: invoices can remain stale in the DB indefinitely.
 *
 * What this does (daily full mirror sync):
 *   1. Fetches ALL invoice + credit note IDs from Holded (no date filter)
 *   2. Fetches the full detail for each document concurrently
 *   3. Runs every document through the canonical import pipeline:
 *        - New documents → inserted with all fields
 *        - Existing documents → state_code / is_paid / paid_date updated if changed
 *   4. Holded is the SINGLE source of truth — DB converges to match it
 *
 * This complements (not replaces) the existing jobs:
 *   - Incremental import (every 15 min): new + recently-changed docs, fast
 *   - Paid-state sync  (every 4h):     unpaid invoices double-checked

 *   - Full resync      (0 3 * * *):  full daily mirror for complete parity
 *
 * Usage:
 *   pnpm exec -- tsx scripts/holded-full-resync.ts
 *
 * Env vars:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL   required
 *   SUPABASE_SERVICE_ROLE_KEY                  required
 *   HOLDED_API_KEY                             required
 *   CONCURRENCY   parallel detail fetches      (default: 8)
 *   BATCH_SIZE    docs fed to importer at once (default: 100)
 *   MAX_DOCS      hard cap on total docs       (default: 5000, 0 = unlimited)
 *   PREVIEW       if "true", dry-run           (default: false)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { holdedListDocuments, holdedFetch } from "../src/lib/holded/holdedFetch";
import { runHoldedInvoicesIncrementalImport } from "../src/lib/holded/holdedImportIncrementalRunner";
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
  return process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
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

async function concurrentMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Holded list helpers
// ---------------------------------------------------------------------------

type DocType = "invoice" | "creditnote";

type HoldedListItem = { id?: string; _id?: string; [key: string]: unknown };

async function fetchAllIds(docType: DocType, maxDocs: number): Promise<{ id: string; docType: DocType; summary: HoldedListItem }[]> {
  const raw = (await holdedListDocuments<HoldedListItem[]>(docType)) ?? [];
  const out: { id: string; docType: DocType; summary: HoldedListItem }[] = [];
  for (const item of raw) {
    const id = String(item.id ?? item._id ?? "").trim();
    if (!id) continue;
    out.push({ id, docType, summary: item });
    if (maxDocs > 0 && out.length >= maxDocs) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const supabaseUrl = requireSupabaseUrl();
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const concurrency = parsePositiveInt(process.env.CONCURRENCY, 8);
  const batchSize = parsePositiveInt(process.env.BATCH_SIZE, 100);
  const maxDocs = parsePositiveInt(process.env.MAX_DOCS, 5000);
  const preview = String(process.env.PREVIEW ?? "").trim().toLowerCase() === "true";

  console.log("=== VIHOLABS holded-full-resync ===");
  console.log(`  concurrency : ${concurrency}`);
  console.log(`  batch_size  : ${batchSize}`);
  console.log(`  max_docs    : ${maxDocs === 0 ? "unlimited" : maxDocs}`);
  console.log(`  preview     : ${preview}`);
  console.log(`  date        : ${todayYmdUtc()}`);
  console.log("");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Fetch all IDs from Holded (invoices + credit notes)
  console.log("1) Fetching all document IDs from Holded (no date filter)...");
  const [invoiceRefs, cnRefs] = await Promise.all([
    fetchAllIds("invoice", maxDocs),
    fetchAllIds("creditnote", maxDocs),
  ]);

  // Deduplicate across types
  const seen = new Set<string>();
  const allRefs: typeof invoiceRefs = [];
  for (const ref of [...invoiceRefs, ...cnRefs]) {
    const key = `${ref.docType}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allRefs.push(ref);
    if (maxDocs > 0 && allRefs.length >= maxDocs * 2) break;
  }

  console.log(`   invoices    : ${invoiceRefs.length}`);
  console.log(`   creditnotes : ${cnRefs.length}`);
  console.log(`   total unique: ${allRefs.length}`);
  console.log("");

  if (allRefs.length === 0) {
    console.log("2) No documents found in Holded. Done.");
    console.log(JSON.stringify({ ok: true, total: 0, preview }, null, 2));
    return;
  }

  // 2. Fetch full details concurrently, process in batches
  console.log(`2) Fetching details & importing in batches of ${batchSize} (concurrency=${concurrency})...`);

  let totalFetchErrors = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let batchNum = 0;

  for (const batchRefs of chunk(allRefs, batchSize)) {
    batchNum++;
    process.stdout.write(`   batch ${batchNum} (${batchRefs.length} docs)... `);

    type FetchResult =
      | { ref: (typeof allRefs)[0]; detail: Record<string, unknown> }
      | { ref: (typeof allRefs)[0]; error: string };

    const fetchResults = await concurrentMap(batchRefs, concurrency, async (ref) => {
      try {
        const detail = await holdedFetch(ref.docType, ref.id) as Record<string, unknown>;
        return { ref, detail } as FetchResult;
      } catch (err: unknown) {
        return { ref, error: String(err) } as FetchResult;
      }
    });

    const fetchErrors = fetchResults.filter((r): r is Extract<FetchResult, { error: string }> => "error" in r);
    const fetched = fetchResults.filter((r): r is Extract<FetchResult, { detail: Record<string, unknown> }> => "detail" in r);

    totalFetchErrors += fetchErrors.length;
    if (fetchErrors.length > 0) {
      for (const fe of fetchErrors) {
        console.warn(`\n   fetch_error :: ${fe.ref.id} :: ${fe.error}`);
      }
    }

    if (fetched.length === 0) {
      process.stdout.write(`0 usable\n`);
      continue;
    }

    const docs = fetched.map((f) => ({
      summary: f.ref.summary,
      detail: f.detail,
    }));

    const result = await runHoldedInvoicesIncrementalImport({
      supabase,
      docs,
      preview,
      logger: { info: () => {}, warn: () => {}, error: console.error },
    });

    totalInserted += result.insertedInvoices ?? 0;
    totalUpdated += result.updatedInvoices ?? 0;
    totalSkipped += (result.skipped as any[])?.length ?? 0;

    process.stdout.write(
      `inserted=${result.insertedInvoices} updated=${result.updatedInvoices} skipped=${(result.skipped as any[])?.length ?? 0}\n`
    );
  }

  console.log("");
  const summary = {
    ok: true,
    date: todayYmdUtc(),
    total_refs: allRefs.length,
    fetch_errors: totalFetchErrors,
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
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
