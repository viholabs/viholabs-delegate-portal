/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  holdedFetchJson as holdedListDocuments,
  holdedFetch as holdedDocumentDetail,
} from "@/lib/holded/holdedFetch";
import { runHoldedInvoicesIncrementalImport } from "@/lib/holded/holdedImportIncrementalRunner";

const envLocalPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

type HoldedDocType = "invoice" | "creditnote";
type HoldedSummaryDoc = Record<string, unknown>;

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

function parseLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toYmdFromUnknownDate(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 9999999999 ? raw : raw * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof raw === "string" && raw.trim()) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return toYmdFromUnknownDate(numeric);
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  return null;
}

function extractExternalId(doc: HoldedSummaryDoc): string | null {
  const id =
    (typeof doc.id === "string" && doc.id.trim()) ||
    (typeof doc._id === "string" && doc._id.trim()) ||
    "";

  return id || null;
}

function extractInvoiceNumber(doc: HoldedSummaryDoc): string | null {
  if (typeof doc.docNumber === "string" && doc.docNumber.trim()) {
    return doc.docNumber.trim();
  }

  if (typeof doc.number === "string" && doc.number.trim()) {
    return doc.number.trim();
  }

  return null;
}

function inferDocTypeFromSummary(doc: HoldedSummaryDoc): HoldedDocType {
  const candidates = [doc.docType, doc.documentType, doc.type, doc.kind];

  for (const value of candidates) {
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (
        normalized.includes("credit") ||
        normalized.includes("refund") ||
        normalized.includes("abon") ||
        normalized.includes("rectific")
      ) {
        return "creditnote";
      }

      if (normalized.includes("invoice") || normalized.includes("fact")) {
        return "invoice";
      }
    }
  }

  const numberCandidate = extractInvoiceNumber(doc) ?? "";
  if (numberCandidate.toUpperCase().startsWith("CN")) {
    return "creditnote";
  }

  return "invoice";
}

function isDraftSummary(doc: HoldedSummaryDoc): boolean {
  const candidates = [
    doc.status,
    doc.docType,
    doc.documentType,
    doc.type,
    doc.kind,
    doc.stage,
  ];

  for (const value of candidates) {
    if (typeof value !== "string") continue;

    const normalized = value.trim().toLowerCase();

    if (
      normalized.includes("draft") ||
      normalized.includes("borrador") ||
      normalized.includes("proforma")
    ) {
      return true;
    }
  }

  const invoiceNumber = extractInvoiceNumber(doc) ?? "";

  if (/^[0-9a-f]{24}$/i.test(invoiceNumber)) {
    return true;
  }

  return false;
}

function sortByDateDesc(a: HoldedSummaryDoc, b: HoldedSummaryDoc): number {
  const ay = toYmdFromUnknownDate(a.date) ?? "";
  const by = toYmdFromUnknownDate(b.date) ?? "";

  if (ay > by) return -1;
  if (ay < by) return 1;

  const an = extractInvoiceNumber(a) ?? "";
  const bn = extractInvoiceNumber(b) ?? "";

  return bn.localeCompare(an, "es");
}

async function fetchHoldedDocumentsByType(
  docType: HoldedDocType
): Promise<HoldedSummaryDoc[]> {
  const result = await holdedListDocuments(docType);

  if (!Array.isArray(result)) {
    throw new Error(`Holded list for ${docType} did not return an array`);
  }

  return result as HoldedSummaryDoc[];
}

async function fetchHoldedDocumentDetailById(
  docType: HoldedDocType,
  externalId: string
): Promise<Record<string, unknown>> {
  const detail = await holdedDocumentDetail(docType, externalId);

  if (!detail || typeof detail !== "object") {
    throw new Error(
      `Holded detail for ${docType}/${externalId} is empty or invalid`
    );
  }

  return detail as Record<string, unknown>;
}

async function loadAlreadyImportedExternalIds(
  supabase: any,
  externalIds: string[]
): Promise<Set<string>> {
  if (externalIds.length === 0) {
    return new Set<string>();
  }

  const imported = new Set<string>();

  for (let i = 0; i < externalIds.length; i += 500) {
    const chunk = externalIds.slice(i, i + 500);

    const { data, error } = await supabase
      .from("invoices")
      .select("external_invoice_id")
      .eq("source_provider", "holded")
      .in("external_invoice_id", chunk);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      const value =
        typeof row?.external_invoice_id === "string"
          ? row.external_invoice_id.trim()
          : "";

      if (value) {
        imported.add(value);
      }
    }
  }

  return imported;
}

async function main(): Promise<void> {
  const supabaseUrl = requireSupabaseUrl();
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    throw new Error(
      "Missing env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL"
    );
  }

  const limit = parseLimit(process.env.LIMIT, 50);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log("1) Listando Holded...");
  const invoices = await fetchHoldedDocumentsByType("invoice");
  const creditNotes = await fetchHoldedDocumentsByType("creditnote");

  const listedDocs = [...invoices, ...creditNotes]
    .filter((doc) => !isDraftSummary(doc))
    .sort(sortByDateDesc)
    .slice(0, limit);

  console.log(`   invoices total          : ${invoices.length}`);
  console.log(`   creditnotes total       : ${creditNotes.length}`);
  console.log(`   docs no-draft candidate : ${listedDocs.length}`);
  console.log(`   LIMIT applied           : ${limit}`);
  console.log("");

  const externalIds = listedDocs
    .map((doc) => extractExternalId(doc))
    .filter((v): v is string => Boolean(v));

  console.log("2) Comprobando qué docs ya existen en BD...");
  const alreadyImported = await loadAlreadyImportedExternalIds(
    supabase,
    externalIds
  );

  const missingDocs = listedDocs.filter((doc) => {
    const externalId = extractExternalId(doc);
    return externalId !== null && !alreadyImported.has(externalId);
  });

  console.log(`   already imported        : ${alreadyImported.size}`);
  console.log(`   pending import          : ${missingDocs.length}`);
  console.log("");

  if (missingDocs.length === 0) {
    console.log("3) Nada pendiente. Fin.");
    console.log(
      JSON.stringify(
        {
          ok: true,
          listed: listedDocs.length,
          alreadyImported: alreadyImported.size,
          pending: 0,
          insertedInvoices: 0,
          insertedItems: 0,
          skipped: [],
          accepted: [],
        },
        null,
        2
      )
    );
    return;
  }

  console.log("3) Descargando details de los pendientes...");
  const docsToImport: Array<{
    summary: Record<string, unknown>;
    detail: Record<string, unknown>;
  }> = [];

  for (const summary of missingDocs) {
    const externalId = extractExternalId(summary);

    if (!externalId) {
      console.warn("[HOLDED][SKIP] summary sin id/_id");
      continue;
    }

    const docType = inferDocTypeFromSummary(summary);
    const detail = await fetchHoldedDocumentDetailById(docType, externalId);

    docsToImport.push({
      summary,
      detail,
    });

    console.log(
      `   detail ok :: ${externalId} :: ${extractInvoiceNumber(summary) ?? "NO_NUMBER"} :: ${docType}`
    );
  }

  console.log(`   details descargados     : ${docsToImport.length}`);
  console.log("");

  if (docsToImport.length === 0) {
    console.log("4) No hay docs válidos para importar.");
    console.log(
      JSON.stringify(
        {
          ok: true,
          listed: listedDocs.length,
          alreadyImported: alreadyImported.size,
          pending: missingDocs.length,
          readyToImport: 0,
          insertedInvoices: 0,
          insertedItems: 0,
          skipped: [],
          accepted: [],
        },
        null,
        2
      )
    );
    return;
  }

  console.log("4) Aplicando import canónico...");
  const result = await runHoldedInvoicesIncrementalImport({
    supabase,
    docs: docsToImport,
    preview: false,
    logger: console,
  });

  console.log("");
  console.log("5) RESULT");
  console.log(JSON.stringify(result, null, 2));
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