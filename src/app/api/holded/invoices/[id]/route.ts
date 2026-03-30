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

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const v = value.trim();
    return v ? v : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function unixToDateYmd(unixOrString: unknown): string | null {
  if (typeof unixOrString === "number" && Number.isFinite(unixOrString)) {
    const ms = unixOrString > 9999999999 ? unixOrString : unixOrString * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof unixOrString === "string" && unixOrString.trim()) {
    const raw = unixOrString.trim();
    const n = Number(raw);
    if (Number.isFinite(n)) return unixToDateYmd(n);

    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

type HoldedLiveMeta = {
  holded_status_label: "Pagado" | "Pendiente" | "Vencido" | "Sin estado";
  due_date: string | null;
  payment_method_label: string | null;
  paid_date: string | null;
  is_paid: boolean | null;
  raw_status: string | null;
};

function computeHoldedLiveMeta(detail: Record<string, unknown>): HoldedLiveMeta {
  const rawStatus = asString(detail["status"]);

  const multipleDueDate = pickRecord(detail["multipledueDate"]);
  const multipleDueDateAlt = pickRecord(detail["multipleDueDate"]);

  const dueDate =
    unixToDateYmd(detail["dueDate"]) ??
    unixToDateYmd(multipleDueDate?.["date"]) ??
    unixToDateYmd(multipleDueDateAlt?.["date"]) ??
    unixToDateYmd(detail["forecastDate"]);

  const total = asNumber(detail["total"]) ?? 0;
  const paymentsTotal = asNumber(detail["paymentsTotal"]) ?? 0;
  const paymentsPending = asNumber(detail["paymentsPending"]) ?? 0;

  const paymentsDetail = Array.isArray(detail["paymentsDetail"])
    ? (detail["paymentsDetail"] as Array<Record<string, unknown>>)
    : [];

  let latestPaidDate: string | null = null;

  for (const payment of paymentsDetail) {
    const dateCandidate =
      unixToDateYmd(payment?.["date"]) ??
      unixToDateYmd(payment?.["paidAt"]) ??
      unixToDateYmd(payment?.["createdAt"]);

    if (dateCandidate && (!latestPaidDate || dateCandidate > latestPaidDate)) {
      latestPaidDate = dateCandidate;
    }
  }

  // SOLO texto legible. Nunca devolver IDs raros al usuario.
  const paymentMethodLabel =
    asString(detail["paymentMethodName"]) ??
    asString(detail["payment_method_name"]) ??
    asString(detail["paymentMethodLabel"]) ??
    asString(detail["payment_method_label"]) ??
    null;

  const isPaid =
    paymentsTotal > 0 &&
    (paymentsPending <= 0 || paymentsTotal >= total);

  const holdedStatusLabel: HoldedLiveMeta["holded_status_label"] = isPaid
    ? "Pagado"
    : dueDate && dueDate < todayYmdUtc()
      ? "Vencido"
      : "Pendiente";

  return {
    holded_status_label: holdedStatusLabel,
    due_date: dueDate,
    payment_method_label: paymentMethodLabel,
    paid_date: latestPaidDate,
    is_paid: isPaid,
    raw_status: rawStatus,
  };
}

async function fetchHoldedInvoiceDetail(
  externalInvoiceId: string
): Promise<Record<string, unknown> | null> {
  const apiKey = String(process.env.HOLDED_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const url = `https://api.holded.com/api/invoicing/v1/documents/invoice/${encodeURIComponent(
    externalInvoiceId
  )}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      key: apiKey,
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const parsed = (await response.json()) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
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

    stage = "holded_live_detail";
    let enrichedInvoice = { ...invoice };

    const externalInvoiceId = String(invoice?.external_invoice_id ?? "").trim();
    if (invoice?.source_provider === "holded" && externalInvoiceId) {
      const holdedDetail = await fetchHoldedInvoiceDetail(externalInvoiceId);

      if (holdedDetail) {
        const liveMeta = computeHoldedLiveMeta(holdedDetail);

        enrichedInvoice = {
          ...enrichedInvoice,
          holded_status_label: liveMeta.holded_status_label,
          due_date: liveMeta.due_date,
          payment_method_label: liveMeta.payment_method_label,
          paid_date: liveMeta.paid_date ?? enrichedInvoice.paid_date ?? null,
          is_paid:
            typeof liveMeta.is_paid === "boolean"
              ? liveMeta.is_paid
              : enrichedInvoice.is_paid ?? null,
          raw_holded_status: liveMeta.raw_status,
        };
      }
    }

    return json(200, {
      ok: true,
      stage: "ok",
      invoice: enrichedInvoice,
      items,
      units,
      ...(items_error ? { items_error } : {}),
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: String(e?.message ?? e) });
  }
}