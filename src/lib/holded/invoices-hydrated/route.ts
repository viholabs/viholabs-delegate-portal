// src/lib/holded/invoices-hydrated/route.ts
/**
 * VIHOLABS — Invoices Hydrated helper (server-side)
 *
 * Minimal helper used by other server routes. Read-only.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { holdedDocumentDetail } from "@/lib/holded/holdedClient";

export type HydratedInvoiceRow = {
  id: string;
  invoice_number: string | null;
  external_invoice_id: string | null;
  total: any;
  currency: string | null;
  source_provider: string | null;
  holded?: {
    id: string;
    docNumber: any;
    date: any;
    total: any;
    currency: any;
    status: any;
  } | null;
};

export async function getHydratedHoldedInvoices(limit = 50): Promise<{
  ok: boolean;
  hydrated: HydratedInvoiceRow[];
  errors: Array<{ invoice_id: string | null; holded_id: string | null; error: string }>;
}> {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, external_invoice_id, total, currency, source_provider")
    .eq("source_provider", "holded")
    .limit(limit);

  if (error) return { ok: false, hydrated: [], errors: [{ invoice_id: null, holded_id: null, error: error.message }] };

  const hydrated: HydratedInvoiceRow[] = [];
  const errors: Array<{ invoice_id: string | null; holded_id: string | null; error: string }> = [];

  for (const row of data ?? []) {
    const holdedId = String((row as any)?.external_invoice_id ?? "").trim();

    if (!holdedId) {
      hydrated.push({ ...(row as any), holded: null });
      continue;
    }

    try {
      const raw = await holdedDocumentDetail<any>("invoice", holdedId);
      const detail = raw as any;

      hydrated.push({
        ...(row as any),
        holded: {
          id: holdedId,
          docNumber: detail?.docNumber ?? null,
          date: detail?.date ?? null,
          total: detail?.total ?? null,
          currency: detail?.currency ?? null,
          status: detail?.status ?? null,
        },
      });
    } catch (e: any) {
      errors.push({
        invoice_id: (row as any)?.id ?? null,
        holded_id: holdedId,
        error: String(e?.message ?? e),
      });
      hydrated.push({ ...(row as any), holded: null });
    }
  }

  return { ok: true, hydrated, errors };
}
