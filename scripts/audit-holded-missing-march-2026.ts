/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envLocalPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

import {
  holdedFetchJson as holdedListDocuments,
  holdedFetch as holdedDocumentDetail,
} from "../src/lib/holded/holdedFetch";

type HoldedDocType = "invoice" | "creditnote";

const TARGET_IDS = new Set<string>([
  "69ac0a14afd22b23140f3c34",
  "69ac7c8d760d5776320d64d4",
  "69aede9bd4de6645560dffa5",
]);

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

function extractExternalId(doc: Record<string, unknown>): string | null {
  const id =
    (typeof doc.id === "string" && doc.id.trim()) ||
    (typeof doc._id === "string" && doc._id.trim()) ||
    "";

  return id || null;
}

function inferDocTypeFromSummary(doc: Record<string, unknown>): HoldedDocType {
  const candidates = [
    doc.docType,
    doc.documentType,
    doc.type,
    doc.kind,
  ];

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

  const numberCandidate =
    (typeof doc.docNumber === "string" && doc.docNumber.trim()) ||
    (typeof doc.number === "string" && doc.number.trim()) ||
    "";

  if (numberCandidate.toUpperCase().startsWith("CN")) {
    return "creditnote";
  }

  return "invoice";
}

function isDraftSummary(doc: Record<string, unknown>): boolean {
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

  const invoiceNumber =
    (typeof doc.docNumber === "string" && doc.docNumber.trim()) ||
    (typeof doc.number === "string" && doc.number.trim()) ||
    "";

  if (/^[0-9a-f]{24}$/i.test(invoiceNumber)) {
    return true;
  }

  return false;
}

function pickFields(obj: Record<string, unknown>) {
  return {
    id: obj.id ?? null,
    _id: obj._id ?? null,
    docNumber: obj.docNumber ?? null,
    number: obj.number ?? null,
    date: obj.date ?? null,
    date_ymd: toYmdFromUnknownDate(obj.date),
    status: obj.status ?? null,
    draft: obj.draft ?? null,
    docType: obj.docType ?? null,
    documentType: obj.documentType ?? null,
    type: obj.type ?? null,
    kind: obj.kind ?? null,
    stage: obj.stage ?? null,
    contactId: obj.contactId ?? null,
    contact_id: obj.contact_id ?? null,
    currency: obj.currency ?? null,
  };
}

async function fetchHoldedDocumentsByType(docType: HoldedDocType): Promise<any[]> {
  const result = await holdedListDocuments(docType);

  if (!Array.isArray(result)) {
    throw new Error(`Holded list for ${docType} did not return an array`);
  }

  return result;
}

async function fetchHoldedDocumentDetailById(
  docType: HoldedDocType,
  externalId: string
): Promise<any> {
  const detail = await holdedDocumentDetail(docType, externalId);

  if (!detail || typeof detail !== "object") {
    throw new Error(`Holded detail for ${docType}/${externalId} is empty or invalid`);
  }

  return detail;
}

async function main() {
  console.log("");
  console.log("1) Listando Holded...");
  const invoices = await fetchHoldedDocumentsByType("invoice");
  const creditNotes = await fetchHoldedDocumentsByType("creditnote");

  const allDocs = [...invoices, ...creditNotes];
  console.log(`   invoices total    : ${invoices.length}`);
  console.log(`   creditnotes total : ${creditNotes.length}`);
  console.log(`   all docs total    : ${allDocs.length}`);
  console.log("");

  const matchedSummaries = allDocs
    .filter((doc) => {
      const externalId = extractExternalId(doc);
      return externalId !== null && TARGET_IDS.has(externalId);
    })
    .map((doc) => {
      const externalId = extractExternalId(doc)!;
      return {
        external_id: externalId,
        inferred_doc_type: inferDocTypeFromSummary(doc),
        is_draft_summary: isDraftSummary(doc),
        summary: pickFields(doc),
      };
    });

  console.log("2) Summaries encontradas...");
  console.log(JSON.stringify(matchedSummaries, null, 2));
  console.log("");

  console.log("3) Descargando details...");
  const detailsOutput: Array<Record<string, unknown>> = [];

  for (const item of matchedSummaries) {
    const externalId = String(item.external_id);
    const docType = String(item.inferred_doc_type) as HoldedDocType;
    const detail = await fetchHoldedDocumentDetailById(docType, externalId);

    detailsOutput.push({
      external_id: externalId,
      inferred_doc_type: docType,
      detail: pickFields(detail),
      detail_keys: Object.keys(detail).sort(),
    });
  }

  console.log(JSON.stringify(detailsOutput, null, 2));
  console.log("");

  console.log("4) RESUMEN");
  for (const item of matchedSummaries) {
    console.log(
      `${item.external_id} :: ${item.summary.docNumber ?? item.summary.number ?? "NO_NUMBER"} :: inferred=${item.inferred_doc_type} :: isDraftSummary=${item.is_draft_summary}`
    );
  }
  console.log("");
}

main().catch((error: unknown) => {
  console.error("");
  console.error("ERROR");
  console.error(error);
  process.exit(1);
});