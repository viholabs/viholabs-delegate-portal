import "dotenv/config";

import {
  holdedDocumentDetail,
  holdedListDocuments,
} from "../src/lib/holded/holdedFetch";
import { runHoldedInvoicesIncrementalImport } from "../src/lib/holded/holdedImportIncrementalRunner";

type HoldedDocType = "invoice" | "creditnote";

type HoldedSummary = {
  id?: string;
  _id?: string;
  docNumber?: string | null;
  desc?: string | null;
  contact?: string | null;
  contactName?: string | null;
  date?: number | string | null;
  dueDate?: number | string | null;
  status?: string | null;
  draft?: boolean | null;
  [key: string]: unknown;
};

type HoldedDocBundle = {
  summary: HoldedSummary & { docType: HoldedDocType };
  detail: unknown;
};

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  const value = Number(raw);

  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return fallback;
}

function pickDocId(doc: HoldedSummary): string | null {
  const id =
    (typeof doc.id === "string" && doc.id.trim() ? doc.id.trim() : null) ||
    (typeof doc._id === "string" && doc._id.trim() ? doc._id.trim() : null);

  return id;
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isDraftDocument(doc: HoldedSummary): boolean {
  if (doc.draft === true) {
    return true;
  }

  const status = normalizeStatus(doc.status);

  if (status === "draft") {
    return true;
  }

  return false;
}

async function fetchHoldedDocumentsByType(
  docType: HoldedDocType,
  limit: number
): Promise<HoldedSummary[]> {
  const rows = await holdedListDocuments<HoldedSummary[]>(docType, { limit });

  if (!Array.isArray(rows)) {
    throw new Error(`Holded list for ${docType} did not return an array`);
  }

  return rows;
}

async function fetchDetailForCandidate(
  docType: HoldedDocType,
  summary: HoldedSummary
): Promise<HoldedDocBundle | null> {
  const docId = pickDocId(summary);

  if (!docId) {
    return null;
  }

  const detail = await holdedDocumentDetail<unknown>(docType, docId);

  return {
    summary: {
      ...summary,
      docType,
    },
    detail,
  };
}

function printHeader(title: string) {
  console.log(title);
}

function printKeyValue(label: string, value: unknown) {
  const key = `${label}:`.padEnd(26, " ");
  console.log(`   ${key} ${value}`);
}

async function main() {
  const limit = readPositiveIntEnv("LIMIT", 50);

  printHeader("1) Listando Holded...");

  const invoices = await fetchHoldedDocumentsByType("invoice", limit);
  const creditNotes = await fetchHoldedDocumentsByType("creditnote", limit);

  const invoiceCandidates = invoices
    .filter((doc) => !isDraftDocument(doc))
    .map((doc) => ({ docType: "invoice" as const, summary: doc }));

  const creditNoteCandidates = creditNotes
    .filter((doc) => !isDraftDocument(doc))
    .map((doc) => ({ docType: "creditnote" as const, summary: doc }));

  const allCandidates = [...invoiceCandidates, ...creditNoteCandidates].slice(0, limit);

  printKeyValue("invoices total", invoices.length);
  printKeyValue("creditnotes total", creditNotes.length);
  printKeyValue("docs no-draft candidate", allCandidates.length);
  printKeyValue("LIMIT applied", limit);

  if (allCandidates.length === 0) {
    console.log("");
    console.log("2) Nada pendiente. Fin.");
    console.log(
      JSON.stringify(
        {
          ok: true,
          listed: 0,
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

  console.log("");
  printHeader("2) Descargando details de los pendientes...");

  const docs: HoldedDocBundle[] = [];

  for (const candidate of allCandidates) {
    const docId = pickDocId(candidate.summary);
    const docNumber =
      typeof candidate.summary.docNumber === "string" && candidate.summary.docNumber.trim()
        ? candidate.summary.docNumber.trim()
        : "(sin-docNumber)";

    if (!docId) {
      console.log(
        `   detail skip :: missing-id :: ${docNumber} :: ${candidate.docType}`
      );
      continue;
    }

    const detailBundle = await fetchDetailForCandidate(candidate.docType, candidate.summary);

    if (!detailBundle) {
      console.log(`   detail skip :: ${docId} :: ${docNumber} :: ${candidate.docType}`);
      continue;
    }

    docs.push(detailBundle);
    console.log(`   detail ok :: ${docId} :: ${docNumber} :: ${candidate.docType}`);
  }

  printKeyValue("details descargados", docs.length);

  console.log("");
  printHeader("3) Aplicando import canónico...");

  const result = await (runHoldedInvoicesIncrementalImport as unknown as (input: {
    mode: "docs";
    docs: HoldedDocBundle[];
    limit: number;
  }) => Promise<unknown>)({
    mode: "docs",
    docs,
    limit,
  });

  console.log(
    typeof result === "string" ? result : JSON.stringify(result, null, 2)
  );
}

main().catch((error) => {
  console.error("ERROR");

  if (error instanceof Error) {
    console.error(error.stack || error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
});