import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { holdedFetch as holdedDocumentDetail, holdedFetchJson as holdedListDocuments } from "@/lib/holded/holdedFetch";
import { runHoldedInvoicesIncrementalImport } from "@/lib/holded/holdedImportIncrementalRunner";

export const runtime = "nodejs";

type HoldedListItem = {
  id?: string;
  _id?: string;
  docNumber?: string | null;
  number?: string | null;
  date?: number | string | null;
  docType?: string | null;
  documentType?: string | null;
  type?: string | null;
  status?: string | number | null;
  draft?: boolean | null;
  [key: string]: unknown;
};

function requireEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function createSupabaseAdmin() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toYmd(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 9999999999 ? raw : raw * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return toYmd(n);
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  return null;
}

function inferDocType(item: HoldedListItem): "invoice" | "creditnote" {
  const rawCandidates = [
    item.docType,
    item.documentType,
    item.type,
    item.status,
  ];

  for (const raw of rawCandidates) {
    if (typeof raw !== "string") continue;
    const normalized = raw.trim().toLowerCase();

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

  const numberCandidate =
    (typeof item.docNumber === "string" && item.docNumber.trim()) ||
    (typeof item.number === "string" && item.number.trim()) ||
    "";

  if (numberCandidate.toUpperCase().startsWith("CN")) {
    return "creditnote";
  }

  return "invoice";
}

function getExternalId(item: HoldedListItem): string {
  const id =
    (typeof item.id === "string" && item.id.trim()) ||
    (typeof item._id === "string" && item._id.trim()) ||
    "";

  return id;
}

function getInvoiceNumberCandidate(item: HoldedListItem): string | null {
  if (typeof item.docNumber === "string" && item.docNumber.trim()) {
    return item.docNumber.trim();
  }

  if (typeof item.number === "string" && item.number.trim()) {
    return item.number.trim();
  }

  return null;
}

function isInsideMonth(item: HoldedListItem, month: string): boolean {
  const ymd = toYmd(item.date);
  if (!ymd) return false;
  return ymd.startsWith(`${month}-`);
}

function parseLimit(value: string | null, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function sortByDateAscAndNumber(a: HoldedListItem, b: HoldedListItem): number {
  const da = toYmd(a.date) ?? "";
  const db = toYmd(b.date) ?? "";

  if (da < db) return -1;
  if (da > db) return 1;

  const na = getInvoiceNumberCandidate(a) ?? "";
  const nb = getInvoiceNumberCandidate(b) ?? "";

  return na.localeCompare(nb, "es");
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      month?: string;
      limit?: number;
      preview?: boolean;
    };

    const url = new URL(req.url);
    const month =
      String(body.month ?? url.searchParams.get("month") ?? "").trim() || null;

    if (!month) {
      return NextResponse.json(
        {
          ok: false,
          error: "month is required",
        },
        { status: 400 }
      );
    }

    const limit =
      typeof body.limit === "number"
        ? body.limit
        : parseLimit(url.searchParams.get("limit"), 5000);

    const preview =
      typeof body.preview === "boolean"
        ? body.preview
        : (url.searchParams.get("preview") ?? "false").toLowerCase() === "true";

    const supabase = createSupabaseAdmin();

    const invoicesRaw = await holdedListDocuments("invoice");
    const creditNotesRaw = await holdedListDocuments("creditnote");

    const invoices = Array.isArray(invoicesRaw)
      ? (invoicesRaw as HoldedListItem[])
      : [];
    const creditNotes = Array.isArray(creditNotesRaw)
      ? (creditNotesRaw as HoldedListItem[])
      : [];

    const allDocs = [...invoices, ...creditNotes]
      .filter((item) => isInsideMonth(item, month))
      .sort(sortByDateAscAndNumber)
      .slice(0, limit);

    const docsToImport: Array<{
      summary: Record<string, unknown>;
      detail: Record<string, unknown>;
    }> = [];

    const preloadFailures: Array<Record<string, unknown>> = [];

    for (const item of allDocs) {
      const holdedId = getExternalId(item);
      const invoiceNumberCandidate = getInvoiceNumberCandidate(item);
      const docType = inferDocType(item);

      if (!holdedId) {
        preloadFailures.push({
          code: "missing_external_invoice_id",
          message: "Holded list item without id/_id",
          holded_id: null,
          invoice_number_candidate: invoiceNumberCandidate,
          doc_type: docType,
          list_date: toYmd(item.date),
        });
        continue;
      }

      try {
        const detail = await (holdedDocumentDetail as any)(docType, holdedId);

        docsToImport.push({
          summary: item as Record<string, unknown>,
          detail: (detail ?? {}) as Record<string, unknown>,
        });
      } catch (error) {
        preloadFailures.push({
          code: "detail_fetch_failed",
          message: error instanceof Error ? error.message : "Unknown detail fetch error",
          holded_id: holdedId,
          invoice_number_candidate: invoiceNumberCandidate,
          doc_type: docType,
          list_date: toYmd(item.date),
        });
      }
    }

    const batchResult = await runHoldedInvoicesIncrementalImport({
      supabase,
      docs: docsToImport,
      preview,
      logger: console,
    });

    return NextResponse.json({
      ok: true,
      month,
      preview,
      total_seen: allDocs.length,
      docs_preloaded: docsToImport.length,
      preload_failures_count: preloadFailures.length,
      accepted_count: Array.isArray(batchResult?.accepted) ? batchResult.accepted.length : 0,
      skipped_count: Array.isArray(batchResult?.skipped) ? batchResult.skipped.length : 0,
      inserted_invoices: Number(batchResult?.insertedInvoices ?? 0),
      inserted_items: Number(batchResult?.insertedItems ?? 0),
      existing_invoices: Number(batchResult?.existingInvoices ?? 0),
      updated_states: Number(batchResult?.updatedStates ?? 0),
      accepted: batchResult?.accepted ?? [],
      skipped: batchResult?.skipped ?? [],
      preload_failures: preloadFailures,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import incremental error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}