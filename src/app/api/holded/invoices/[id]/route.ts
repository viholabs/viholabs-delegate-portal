import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function deriveKind(lineType: any): "SALE" | "PROMO" | "DISCOUNT" | "NEUTRAL" {
  const lt = String(lineType ?? "").toUpperCase();

  if (lt.includes("PROMO")) return "PROMO";
  if (lt.includes("DISCOUNT")) return "DISCOUNT";
  if (lt.includes("SALE")) return "SALE";

  return "NEUTRAL";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let stage = "init";

  try {
    stage = "auth";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) {
      return json(ar?.status ?? 401, { ok: false, stage, error: ar?.error });
    }

    const { id: rawId } = await ctx.params;
    const id = String(rawId ?? "").trim();
    if (!id) {
      return json(400, { ok: false, stage, error: "Missing id" });
    }

    const supabase = supabaseAdmin();

    stage = "invoice_query";
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (invErr) {
      return json(500, { ok: false, stage, error: invErr.message });
    }

    if (!invoice) {
      return json(404, { ok: false, stage, error: "Invoice not found" });
    }

    stage = "items_query";
    const { data: itemsRaw, error: itemsErr } = await supabase
      .from("invoice_items")
      .select(
        "id, line_type, units, description, unit_net_price, line_net_amount, vat_rate, line_vat_amount, line_gross_amount, created_at"
      )
      .eq("invoice_id", id);

    let items_error: string | null = null;
    if (itemsErr) items_error = itemsErr.message;

    const safeItems = Array.isArray(itemsRaw) ? itemsRaw : [];
    const items = safeItems.map((it: any) => ({
      ...it,
      kind: deriveKind(it.line_type),
    }));

    const units = { sold: 0, promo: 0, discount: 0, neutral: 0 };
    for (const it of items) {
      const u = Number(it.units ?? 0) || 0;
      if (it.kind === "SALE") units.sold += u;
      else if (it.kind === "PROMO") units.promo += u;
      else if (it.kind === "DISCOUNT") units.discount += u;
      else units.neutral += u;
    }

    return json(200, {
      ok: true,
      stage: "ok",
      invoice,
      items,
      units,
      ...(items_error ? { items_error } : {}),
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: String(e?.message ?? e) });
  }
}
