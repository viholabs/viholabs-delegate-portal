/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { holdedFetch } from "../src/lib/holded/holdedFetch";
import { fetchChangedIds } from "../src/lib/holded/holdedIncremental";
import { runHoldedInvoicesIncrementalImport } from "../src/lib/holded/holdedImportIncrementalRunner";

const envLocalPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

type HoldedDocType = "invoice" | "creditnote";

type HoldedDocRef = {
  id: string;
  docType: HoldedDocType;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value.trim();
}

function requireSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function normalizeYmd(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  if (!value) return fallback;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return parsed.toISOString().slice(0, 10);
}

function dedupeDocRefs(items: HoldedDocRef[]): HoldedDocRef[] {
  const seen = new Set<string>();
  const out: HoldedDocRef[] = [];

  for (const item of items) {
    const key = `${item.docType}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

async function fetchAllChangedDocRefsByType(args: {
  docType: HoldedDocType;
  since: string;
  until: string;
  pageSize: number;
}): Promise<HoldedDocRef[]> {
  const { docType, since, until, pageSize } = args;

  const collected: HoldedDocRef[] = [];
  let page = 1;

  while (true) {
    const ids = await fetchChangedIds({
      docType,
      since,
      until,
      page,
      pageSize,
    });

    if (!Array.isArray(ids) || ids.length === 0) {
      break;
    }

    for (const id of ids) {
      if (typeof id === "string" && id.trim()) {
        collected.push({
          id: id.trim(),
          docType,
        });
      }
    }

    if (ids.length < pageSize) {
      break;
    }

    page += 1;
  }

  return collected;
}

async function fetchHoldedDocumentDetailById(
  docType: HoldedDocType,
  externalId: string
): Promise<Record<string, unknown>> {
  const detail = await holdedFetch(docType, externalId);

  if (!detail || typeof detail !== "object") {
    throw new Error(
      `Holded detail for ${docType}/${externalId} is empty or invalid`
    );
  }

  return detail as Record<string, unknown>;
}

async function main(): Promise<void> {
  const supabaseUrl = requireSupabaseUrl();
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    throw new Error(
      "Missing env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL"
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const lookbackDays = parsePositiveInt(process.env.LOOKBACK_DAYS, 30);
  const since = normalizeYmd(
    process.env.SINCE,
    getDateNDaysAgo(lookbackDays)
  );
  const until = normalizeYmd(
    process.env.UNTIL,
    new Date().toISOString().slice(0, 10)
  );
  const pageSize = parsePositiveInt(process.env.PAGE_SIZE, 100);
  const preview =
    String(process.env.PREVIEW ?? "").trim().toLowerCase() === "true";

  console.log("1) Incremental window");
  console.log(`   since                : ${since}`);
  console.log(`   until                : ${until}`);
  console.log(`   page size            : ${pageSize}`);
  console.log(`   preview              : ${preview}`);
  console.log("");

  console.log("2) Buscando IDs cambiados en Holded...");
  const invoiceRefs = await fetchAllChangedDocRefsByType({
    docType: "invoice",
    since,
    until,
    pageSize,
  });

  const creditNoteRefs = await fetchAllChangedDocRefsByType({
    docType: "creditnote",
    since,
    until,
    pageSize,
  });

  const changedRefs = dedupeDocRefs([...invoiceRefs, ...creditNoteRefs]);

  console.log(`   invoices changed     : ${invoiceRefs.length}`);
  console.log(`   creditnotes changed  : ${creditNoteRefs.length}`);
  console.log(`   total changed refs   : ${changedRefs.length}`);
  console.log("");

  if (changedRefs.length === 0) {
    console.log("3) No changes detected. Fin.");
    console.log(
      JSON.stringify(
        {
          ok: true,
          since,
          until,
          preview,
          changedInvoices: 0,
          changedCreditNotes: 0,
          changedTotal: 0,
          docsFetched: 0,
          insertedInvoices: 0,
          insertedItems: 0,
          existingInvoices: 0,
          updatedInvoices: 0,
          skipped: [],
          accepted: [],
        },
        null,
        2
      )
    );
    return;
  }

  console.log("3) Descargando details de los cambios...");
  const docsToImport: Array<{
    summary: Record<string, unknown>;
    detail: Record<string, unknown>;
  }> = [];

  const fetchErrors: Array<{
    id: string;
    docType: HoldedDocType;
    message: string;
  }> = [];

  for (const ref of changedRefs) {
    try {
      const detail = await fetchHoldedDocumentDetailById(ref.docType, ref.id);

      docsToImport.push({
        summary: {
          id: ref.id,
          docType: ref.docType,
        },
        detail,
      });

      console.log(`   detail ok :: ${ref.id} :: ${ref.docType}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      fetchErrors.push({
        id: ref.id,
        docType: ref.docType,
        message,
      });

      console.warn(
        `   detail error :: ${ref.id} :: ${ref.docType} :: ${message}`
      );
    }
  }

  console.log(`   details descargados  : ${docsToImport.length}`);
  console.log(`   detail errors        : ${fetchErrors.length}`);
  console.log("");

  if (docsToImport.length === 0) {
    console.log("4) No hay docs válidos para importar.");
    console.log(
      JSON.stringify(
        {
          ok: true,
          since,
          until,
          preview,
          changedInvoices: invoiceRefs.length,
          changedCreditNotes: creditNoteRefs.length,
          changedTotal: changedRefs.length,
          docsFetched: 0,
          fetchErrors,
          insertedInvoices: 0,
          insertedItems: 0,
          existingInvoices: 0,
          updatedInvoices: 0,
          skipped: [],
          accepted: [],
        },
        null,
        2
      )
    );
    return;
  }

  console.log("4) Aplicando import canónico incremental...");
  const result = await runHoldedInvoicesIncrementalImport({
    supabase,
    docs: docsToImport,
    preview,
    logger: console,
  });

  console.log("");
  console.log("5) RESULT");
  console.log(
    JSON.stringify(
      {
        ok: true,
        since,
        until,
        preview,
        changedInvoices: invoiceRefs.length,
        changedCreditNotes: creditNoteRefs.length,
        changedTotal: changedRefs.length,
        docsFetched: docsToImport.length,
        fetchErrors,
        ...result,
      },
      null,
      2
    )
  );
}

main()
  .then((res: void) => {
    return res;
  })
  .catch((e: unknown) => {
    console.error("");
    console.error("ERROR");
    console.error(e);
    process.exit(1);
  });