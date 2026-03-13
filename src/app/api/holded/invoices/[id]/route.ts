import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

const SALE_SKUS = new Set<string>(["VIHO-OBE-SPRAY-002"]);

const PROMO_SKUS = new Set<string>([
  "VIHO-OBE-PROMO-001",
  "VIHO-OBE-PROMO-002",
  "VIHO-OBE-PROMO-003",
  "VIHO-OBE-PROMO-CP-12M",
  "VIHO-OBE-PROMO-PLUS-4M",
]);

const NEUTRAL_SKUS = new Set<string>(["VIHO-BOOK-BASCULA"]);

function norm(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function extractSku(row: any): string | null {
  const candidates = [
    row?.sku,
    row?.product_sku,
    row?.sku_code,
    row?.product_code,
    row?.reference,
    row?.product_reference,
    row?.item_sku,
    row?.variant_sku,
    row?.source_sku,
  ];

  for (const candidate of candidates) {
    const v = norm(candidate);
    if (!v) continue;
    if (v === "0") continue;
    if (v === "-") continue;
    return v;
  }

  return null;
}

function isNeutralByDescription(row: any): boolean {
  const d = normText(row?.description);
  const name = normText(row?.name);
  const ref = normText(row?.reference);

  const haystack = `${d} ${name} ${ref}`.trim();

  if (!haystack) return false;

  if (haystack === "estandar") return true;
  if (haystack.includes("shopify correccion de impuestos")) return true;
  if (haystack.includes("shopify correccion impuestos")) return true;
  if (haystack.includes("correccion de impuestos")) return true;
  if (haystack.includes("correccion impuestos")) return true;
  if (haystack.includes("ajuste de impuestos")) return true;
  if (haystack.includes("ajuste impuestos")) return true;

  return false;
}

function deriveKind(row: any): "SALE" | "PROMO" | "DISCOUNT" | "NEUTRAL" {
  const sku = extractSku(row);

  if (sku) {
    if (SALE_SKUS.has(sku)) return "SALE";
    if (PROMO_SKUS.has(sku)) return "PROMO";
    if (NEUTRAL_SKUS.has(sku)) return "NEUTRAL";
  }

  if (isNeutralByDescription(row)) {
    return "NEUTRAL";
  }

  const lt = String(row?.line_type ?? "").trim().toLowerCase();

  if (lt === "sale") return "SALE";
  if (lt === "promotion") return "PROMO";
  if (lt === "neutral") return "NEUTRAL";
  if (lt === "discount") return "DISCOUNT";

  if (lt === "promo" || lt === "foc" || lt === "free") return "PROMO";

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
      .select("*")
      .eq("invoice_id", id);

    let items_error: string | null = null;
    if (itemsErr) items_error = itemsErr.message;

    const safeItems = Array.isArray(itemsRaw) ? itemsRaw : [];

    const items = safeItems.map((it: any) => {
      const sku = extractSku(it);
      const kind = deriveKind(it);

      return {
        ...it,
        sku,
        kind,
      };
    });

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