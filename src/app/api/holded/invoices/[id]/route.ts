import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { asString } from "@/lib/holded/holdedPrimitives";
import { sumInvoiceUnits } from "@/lib/holded/holdedLineClassifier";
import {
  fetchHoldedInvoiceDetail,
  computeHoldedLiveMeta,
  resolvePaymentMethodName,
} from "@/lib/holded/holdedLiveStatus";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const ar = (await getActorFromRequest(req)) as { ok?: boolean; status?: number };
    if (!ar?.ok) {
      return json(ar?.status ?? 401, { ok: false });
    }

    const { id } = await ctx.params;
    const supabase = supabaseAdmin();

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (invoiceError) {
      return json(500, { ok: false, error: invoiceError.message });
    }
    if (!invoice) {
      return json(404, { ok: false, error: "Invoice not found" });
    }

    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id);

    if (itemsError) {
      return json(500, { ok: false, error: itemsError.message });
    }

    let enrichedInvoice: Record<string, unknown> = { ...invoice };

    const externalInvoiceId = String(invoice?.external_invoice_id ?? "").trim();

    if (invoice?.source_provider === "holded" && externalInvoiceId) {
      const detail = await fetchHoldedInvoiceDetail(externalInvoiceId);

      if (detail) {
        const paymentMethodId =
          asString(detail["paymentMethodId"]) ??
          asString(detail["payment_method_id"]) ??
          null;

        const resolvedPaymentMethod = await resolvePaymentMethodName(paymentMethodId);
        const liveMeta = computeHoldedLiveMeta(detail, resolvedPaymentMethod);

        enrichedInvoice = {
          ...enrichedInvoice,
          holded_status_label: liveMeta.holded_status_label,
          due_date: liveMeta.due_date,
          payment_method_label: liveMeta.payment_method_label,
          paid_date: liveMeta.paid_date ?? enrichedInvoice["paid_date"] ?? null,
          is_paid:
            typeof liveMeta.is_paid === "boolean"
              ? liveMeta.is_paid
              : enrichedInvoice["is_paid"] ?? null,
        };
      }
    }

    const safeItems = Array.isArray(items) ? items : [];
    const units = sumInvoiceUnits(safeItems);

    return json(200, {
      ok: true,
      invoice: enrichedInvoice,
      items: safeItems,
      units,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { ok: false, error: message });
  }
}
