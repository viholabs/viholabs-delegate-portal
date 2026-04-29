// src/lib/holded/invoiceSync.ts
// VIHOLABS — Full Holded Invoice Sync (CANONICAL)
//
// Fetches ALL invoices + credit notes from Holded and upserts them into
// holded_invoices + holded_invoice_lines.
//
// Run once to populate the mirror, then run incrementally after each change.
// After sync, delegate routes read exclusively from holded_invoices — no stale invented data.

import { holdedListDocuments, holdedDocumentDetail } from "./holdedClient";
import { asString, asNumber } from "./holdedPrimitives";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWithConcurrencyLimit } from "./holdedLiveStatus";

export type InvoiceSyncResult = {
  totalFound: number;
  synced: number;
  errors: number;
  durationMs: number;
};

type HoldedListItem = { id?: string; _id?: string; [key: string]: unknown };

export async function syncAllHoldedInvoices(): Promise<InvoiceSyncResult> {
  const db = supabaseAdmin();
  const t0 = Date.now();
  let synced = 0;
  let errors = 0;

  // 1. List all IDs (holdedListDocuments paginates automatically — up to 5000)
  const [invoiceList, creditNoteList] = await Promise.all([
    holdedListDocuments<HoldedListItem[]>("invoice"),
    holdedListDocuments<HoldedListItem[]>("creditnote"),
  ]);

  const allItems: Array<{ id: string; isCreditNote: boolean }> = [];
  for (const item of invoiceList) {
    const id = asString(item.id ?? item._id);
    if (id) allItems.push({ id, isCreditNote: false });
  }
  for (const item of creditNoteList) {
    const id = asString(item.id ?? item._id);
    if (id) allItems.push({ id, isCreditNote: true });
  }

  // Deduplicate (creditnote endpoints sometimes overlap with invoice list)
  const seen = new Set<string>();
  const unique = allItems.filter(({ id }) => !seen.has(id) && seen.add(id));

  // 2. Fetch detail for each and upsert — concurrency limited to avoid Holded rate limits
  const tasks = unique.map(({ id, isCreditNote }) => async () => {
    try {
      const detail = await holdedDocumentDetail<Record<string, unknown>>(
        isCreditNote ? "creditnote" : "invoice",
        id
      );

      const docNumber = asString(detail.docNumber ?? detail.number ?? detail.doc_number);
      // Holded sends the contact ID as a plain string in the "contact" field,
      // NOT as "contactId". Check the string value first, then the named fields.
      const contactId = asString(
        (typeof detail.contact === "string" ? detail.contact : null) ??
        detail.contactId ??
        detail.contact_id
      );
      const contactRec = typeof detail.contact === "object" && detail.contact !== null
        ? (detail.contact as Record<string, unknown>)
        : null;
      const contactName = asString(
        detail.contactName ?? detail.contact_name ?? contactRec?.name
      );

      const toISO = (unix: number | null): string | null =>
        unix ? new Date(unix * 1000).toISOString() : null;

      const dateISO = toISO(asNumber(detail.date));
      const dueDateISO = toISO(asNumber(detail.dueDate ?? detail.due_date));
      const modifiedISO = toISO(asNumber(detail.dateLastModified ?? detail.date_last_modified));

      const now = new Date().toISOString();

      // Upsert invoice row — first_synced_at omitted so DB DEFAULT preserves original value
      const { error: upsertError } = await db.from("holded_invoices").upsert(
        {
          id,
          doc_number: docNumber,
          contact_id: contactId,
          contact_name: contactName,
          date: dateISO,
          due_date: dueDateISO,
          date_last_modified: modifiedISO,
          total: asNumber(detail.total) ?? 0,
          status: asNumber(detail.status) ?? 0,
          description: asString(detail.description),
          raw: detail,
          is_credit_note: isCreditNote,
          from_invoice_id: asString(detail.fromInvoiceId ?? detail.from_invoice_id),
          last_synced_at: now,
        },
        { onConflict: "id" }
      );

      if (upsertError) {
        console.error(`[invoiceSync] upsert error ${id}:`, upsertError.message);
        errors++;
        return;
      }

      // Sync line items — delete existing then insert fresh
      const products = Array.isArray(detail.products)
        ? (detail.products as Record<string, unknown>[])
        : [];

      await db.from("holded_invoice_lines").delete().eq("invoice_id", id);

      if (products.length > 0) {
        const lines = products.map((p, position) => {
          const price = asNumber(p.price ?? p.unit_price) ?? 0;
          const units = asNumber(p.units ?? p.qty ?? p.quantity) ?? 0;
          const discountPct = asNumber(p.discount ?? p.discount_pct) ?? 0;
          // Holded products don't include a subtotal field — compute it
          const computedSubtotal = Math.round(price * units * (1 - discountPct / 100) * 100) / 100;

          return {
            invoice_id: id,
            position,
            sku: asString(p.sku ?? p.code),
            description: asString(p.name ?? p.desc ?? p.description),
            quantity: units,
            unit_price: price,
            discount_pct: discountPct,
            subtotal: computedSubtotal,
            tax_id: p.taxes ? JSON.stringify(p.taxes) : null,
            raw: p,
            last_synced_at: now,
          };
        });

        const { error: linesError } = await db
          .from("holded_invoice_lines")
          .insert(lines);

        if (linesError) {
          console.error(`[invoiceSync] lines error ${id}:`, linesError.message);
          // Line errors don't block invoice sync — invoice data is still saved
        }
      }

      synced++;
    } catch (e) {
      console.error(`[invoiceSync] detail error ${id}:`, e);
      errors++;
    }
  });

  await runWithConcurrencyLimit(tasks, 6);

  return {
    totalFound: unique.length,
    synced,
    errors,
    durationMs: Date.now() - t0,
  };
}
