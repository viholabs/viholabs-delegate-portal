import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function extractBearer(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.VIHOLABS_INTERNAL_BEARER ?? "").trim();
  const got = extractBearer(req);
  return !!expected && !!got && expected === got;
}

function getServiceSupabase() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceKey) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
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
    if (Number.isFinite(n)) {
      return unixToDateYmd(n);
    }
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

function normalizeExplicitHoldedStatus(detail: Record<string, unknown>): string | null {
  const raw =
    asString(detail["status"]) ??
    asString(detail["docStatus"]) ??
    asString(detail["documentStatus"]);

  if (!raw) return null;

  const value = raw.trim().toLowerCase();

  if (value === "paid" || value === "pagado" || value === "cobrado") {
    return "PAID";
  }

  if (value === "pending" || value === "pendiente") {
    return "PENDING";
  }

  if (value === "overdue" || value === "vencido") {
    return "OVERDUE";
  }

  if (value === "cancelled" || value === "canceled" || value === "anulado") {
    return "CANCELLED";
  }

  return null;
}

function extractDueDate(detail: Record<string, unknown>): string | null {
  const multipleDueDate =
    typeof detail["multipledueDate"] === "object" && detail["multipledueDate"] !== null
      ? (detail["multipledueDate"] as Record<string, unknown>)
      : null;

  const multipleDueDateAlt =
    typeof detail["multipleDueDate"] === "object" && detail["multipleDueDate"] !== null
      ? (detail["multipleDueDate"] as Record<string, unknown>)
      : null;

  return (
    unixToDateYmd(detail["dueDate"]) ??
    unixToDateYmd(multipleDueDate?.["date"]) ??
    unixToDateYmd(multipleDueDateAlt?.["date"]) ??
    unixToDateYmd(detail["forecastDate"])
  );
}

function computeDesiredStateCode(detail: Record<string, unknown>): string {
  const explicit = normalizeExplicitHoldedStatus(detail);

  if (explicit === "CANCELLED") {
    return "CANCELLED";
  }

  const total = asNumber(detail["total"]) ?? 0;
  const paymentsTotal = asNumber(detail["paymentsTotal"]) ?? 0;
  const paymentsPending = asNumber(detail["paymentsPending"]) ?? 0;

  const isPaid =
    paymentsTotal > 0 &&
    (paymentsPending <= 0 || paymentsTotal >= total);

  if (isPaid || explicit === "PAID") {
    return "PAID";
  }

  const dueDate = extractDueDate(detail);
  const today = todayYmdUtc();

  if (paymentsPending > 0 && dueDate !== null && dueDate < today) {
    return "OVERDUE";
  }

  if (explicit === "OVERDUE") {
    return "OVERDUE";
  }

  return "PENDING";
}

async function fetchHoldedInvoiceDetail(invoiceId: string) {
  const apiKey = String(process.env.HOLDED_API_KEY ?? "").trim();

  if (!apiKey) {
    throw new Error("Missing env: HOLDED_API_KEY");
  }

  const url = `https://api.holded.com/api/invoicing/v1/documents/invoice/${encodeURIComponent(
    invoiceId
  )}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      key: apiKey,
      accept: "application/json",
    },
    cache: "no-store",
  });

  const rawText = await response.text();

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }

  if (!response.ok) {
    throw new Error(
      `Holded detail failed: ${response.status} ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid Holded invoice payload");
  }

  return parsed as Record<string, unknown>;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return { raw: String(error) };
    }
  }

  return { raw: String(error) };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ invoiceId: string }> }
) {
  try {
    if (!isAuthorized(req)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const { invoiceId } = await context.params;
    const normalizedInvoiceId = invoiceId?.trim();

    if (!normalizedInvoiceId) {
      return json(400, { ok: false, error: "Missing invoiceId" });
    }

    const supabase = getServiceSupabase();
    const detail = await fetchHoldedInvoiceDetail(normalizedInvoiceId);
    const nextStateCode = computeDesiredStateCode(detail);

    const { data: existingInvoice, error: findError } = await supabase
      .from("invoices")
      .select("id, invoice_number, external_invoice_id, state_code, is_paid, paid_date, updated_at")
      .eq("source_provider", "holded")
      .eq("external_invoice_id", normalizedInvoiceId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!existingInvoice?.id) {
      return json(404, {
        ok: false,
        error: "Invoice not found in local invoices table",
        invoiceId: normalizedInvoiceId,
      });
    }

    const currentStateCode =
      typeof existingInvoice.state_code === "string"
        ? existingInvoice.state_code
        : null;

    if (currentStateCode === nextStateCode) {
      return json(200, {
        ok: true,
        invoiceId: normalizedInvoiceId,
        updated: false,
        current_state_code: currentStateCode,
        next_state_code: nextStateCode,
        invoice_number: existingInvoice.invoice_number ?? null,
        holded_snapshot: {
          status: detail["status"] ?? null,
          dueDate: detail["dueDate"] ?? null,
          paymentsTotal: detail["paymentsTotal"] ?? null,
          paymentsPending: detail["paymentsPending"] ?? null,
          total: detail["total"] ?? null,
        },
      });
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("invoices")
      .update({
        state_code: nextStateCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingInvoice.id)
      .select("id, invoice_number, external_invoice_id, state_code, updated_at");

    if (updateError) {
      throw updateError;
    }

    return json(200, {
      ok: true,
      invoiceId: normalizedInvoiceId,
      updated: true,
      current_state_code: currentStateCode,
      next_state_code: nextStateCode,
      invoice_number: existingInvoice.invoice_number ?? null,
      updated_row: Array.isArray(updatedRows) ? updatedRows[0] ?? null : updatedRows ?? null,
      holded_snapshot: {
        status: detail["status"] ?? null,
        dueDate: detail["dueDate"] ?? null,
        paymentsTotal: detail["paymentsTotal"] ?? null,
        paymentsPending: detail["paymentsPending"] ?? null,
        total: detail["total"] ?? null,
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "Repair failed",
      details: serializeError(error),
    });
  }
}