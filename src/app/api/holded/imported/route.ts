// src/app/api/holded/imported/route.ts
/**
 * VIHOLABS — HOLDed Imported Documents (LOCAL TRUTH + LAST SYNC SKIPS)
 *
 * Canon:
 * - READ ONLY
 * - No Holded API calls
 * - Uses DB truth (invoices table) + last holded_sync_runs payload evidence
 * - SUPER_ADMIN only
 */

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type ActorLite = { id: string; role: string | null };

type ActorFromRequestOk = {
  ok: true;
  actor: ActorLite;
  supaRls: any;
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

type DocType = "invoice" | "creditnote";
type RowStatus = "IMPORTED" | "SKIPPED";

type OutRow = {
  invoice_id: string | null;
  invoice_number: string | null;
  client_name: string | null;
  invoice_date: string | null;
  invoice_month: string | null; // YYYY-MM
  imported_at: string | null;
  doc_type: DocType;
  row_status: RowStatus;
  skip_reason: string | null;
};

function monthKey(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return null;
}

function normalizeDocType(args: {
  invoiceNumber?: unknown;
  sourceMeta?: any;
  explicit?: unknown;
}): DocType {
  const explicit = String(args.explicit ?? "").trim().toLowerCase();
  if (explicit === "creditnote") return "creditnote";
  if (explicit === "invoice") return "invoice";

  const sm = args.sourceMeta ?? {};
  const fromMeta = String(sm?.holded_doc_type ?? "").trim().toLowerCase();
  if (fromMeta === "creditnote") return "creditnote";
  if (fromMeta === "invoice") return "invoice";

  const n = String(args.invoiceNumber ?? "").trim().toUpperCase();
  if (n.startsWith("CN")) return "creditnote";
  return "invoice";
}

function dedupeRows(rows: OutRow[]): OutRow[] {
  const byKey = new Map<string, OutRow>();

  for (const row of rows) {
    const key = String(row.invoice_number ?? "").trim() || `${row.doc_type}:${row.invoice_id ?? row.imported_at ?? Math.random()}`;

    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }

    // Imported wins over skipped
    if (prev.row_status === "SKIPPED" && row.row_status === "IMPORTED") {
      byKey.set(key, row);
      continue;
    }

    // Keep first imported if both imported; otherwise keep first
  }

  return Array.from(byKey.values());
}

export async function GET(req: Request) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);
    if (!isOk(ar)) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "Unauthorized",
      });
    }

    const role = String(ar.actor.role ?? "").trim().toLowerCase();
    if (role !== "super_admin") {
      return json(403, { ok: false, stage: "authz", error: "Forbidden" });
    }

    stage = "supabase_service";
    const admin = getServiceSupabase();

    stage = "query_invoices";
    const { data: invoicesData, error: invoicesError } = await admin
      .from("invoices")
      .select("id, invoice_number, client_name, invoice_date, source_month, created_at, source_meta")
      .eq("source_provider", "holded")
      .order("invoice_date", { ascending: false })
      .limit(1000);

    if (invoicesError) {
      return json(500, { ok: false, stage, error: invoicesError.message });
    }

    const importedRows: OutRow[] = (Array.isArray(invoicesData) ? invoicesData : []).map((r: any) => ({
      invoice_id: r.id ?? null,
      invoice_number: r.invoice_number ?? null,
      client_name: r.client_name ?? null,
      invoice_date: r.invoice_date ?? null,
      invoice_month: r.source_month ?? monthKey(r.invoice_date),
      imported_at: r.created_at ?? null,
      doc_type: normalizeDocType({
        invoiceNumber: r.invoice_number,
        sourceMeta: r.source_meta,
      }),
      row_status: "IMPORTED",
      skip_reason: null,
    }));

    stage = "query_last_sync_run";
    const { data: runRow, error: runError } = await admin
      .from("holded_sync_runs")
      .select("id, started_at, payload")
      .eq("job", "holded_invoices_incremental")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError) {
      return json(500, { ok: false, stage, error: runError.message });
    }

    const payload = runRow?.payload ?? {};
    const skippedItems = Array.isArray(payload?.skipped_items) ? payload.skipped_items : [];

    const skippedRows: OutRow[] = skippedItems.map((r: any) => {
      const invoiceNumber =
        r?.meta?.invoice_number ??
        r?.raw_min?.number ??
        null;

      const invoiceDate =
        r?.meta?.invoice_date ??
        (typeof r?.raw_min?.date === "number"
          ? new Date(r.raw_min.date * 1000).toISOString().slice(0, 10)
          : null);

      const clientName =
        r?.meta?.client_name ??
        null;

      const docType = normalizeDocType({
        invoiceNumber,
        explicit: r?.doc_type ?? r?.meta?.holded_doc_type,
      });

      return {
        invoice_id: null,
        invoice_number: invoiceNumber,
        client_name: clientName,
        invoice_date: invoiceDate,
        invoice_month: monthKey(invoiceDate),
        imported_at: null,
        doc_type: docType,
        row_status: "SKIPPED",
        skip_reason: String(r?.step ?? "skip"),
      };
    });

    const rows = dedupeRows([...importedRows, ...skippedRows]).sort((a, b) => {
      const da = String(a.invoice_date ?? "");
      const db = String(b.invoice_date ?? "");
      if (da !== db) return db.localeCompare(da);
      return String(b.invoice_number ?? "").localeCompare(String(a.invoice_number ?? ""));
    });

    return json(200, {
      ok: true,
      stage: "ok",
      rows,
      meta: {
        imported_rows: importedRows.length,
        skipped_rows: skippedRows.length,
        merged_rows: rows.length,
        last_sync_started_at: runRow?.started_at ?? null,
      },
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: String(e?.message ?? e) });
  }
}