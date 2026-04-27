/**
 * POST /api/holded/invoices/reconcile-open
 *
 * Re-verifica en Holded todas las facturas OPEN para detectar las que
 * ya están saldadas (especialmente via CN/abono, donde paymentsDetail está vacío
 * y el sync incremental no las re-procesa al no aparecer como "modificadas").
 *
 * Cuando una factura está paid pero sin paid_date (CN case), busca la CN
 * correspondiente en nuestra tabla para extraer la fecha.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";
export const maxDuration = 60;

const HOLDED_API_BASE = "https://api.holded.com/api/invoicing/v1";
const EPSILON = 0.02;

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function unixToDateYmd(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 9_999_999_999 ? v : v * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return unixToDateYmd(n);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

async function fetchHoldedDetail(externalId: string): Promise<Record<string, unknown> | null> {
  const apiKey = (process.env.HOLDED_API_KEY ?? "").trim();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${HOLDED_API_BASE}/documents/invoice/${encodeURIComponent(externalId)}`,
      { headers: { key: apiKey, accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (typeof data === "object" && data !== null && !Array.isArray(data))
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractPaidState(detail: Record<string, unknown>, totalGross: number): {
  isPaid: boolean;
  paidDate: string | null;
  paymentsTotal: number | null;
  paymentsPending: number | null;
} {
  const paymentsTotal = asNumber(detail["paymentsTotal"]) ?? asNumber(detail["payments_total"]);
  const paymentsPending = asNumber(detail["paymentsPending"]) ?? asNumber(detail["payments_pending"]);

  // Explicit status check (some invoices have status: "paid")
  const statusRaw = typeof detail["status"] === "string" ? detail["status"].toLowerCase() : "";
  const explicitPaid = statusRaw === "paid" || statusRaw === "pagado" || statusRaw === "cobrado";

  const isPaid =
    explicitPaid ||
    (paymentsTotal !== null && paymentsTotal >= totalGross - EPSILON &&
      (paymentsPending === null || paymentsPending <= EPSILON));

  // Extract paid_date from paymentsDetail entries
  let paidDate: string | null = null;
  const paymentsDetail = Array.isArray(detail["paymentsDetail"]) ? detail["paymentsDetail"] as any[] : [];
  for (const p of paymentsDetail) {
    const d = unixToDateYmd(p?.date) ?? unixToDateYmd(p?.paidAt) ?? unixToDateYmd(p?.createdAt);
    if (d && (!paidDate || d > paidDate)) paidDate = d;
  }

  return { isPaid, paidDate, paymentsTotal, paymentsPending };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveDashboardContext(req);
    if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
    if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

    const supa = ctx.supaService;
    const now = new Date().toISOString();

    // Load all OPEN non-creditnote invoices from Holded
    const { data: openInvoices, error: fetchErr } = await supa
      .from("invoices")
      .select("id, invoice_number, external_invoice_id, total_gross, client_id, invoice_date")
      .eq("source_provider", "holded")
      .eq("is_paid", false)
      .eq("state_code", "OPEN")
      .neq("document_type", "creditnote")
      .not("external_invoice_id", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(100); // process max 100 per call to stay within timeout

    if (fetchErr) return json(500, { ok: false, error: fetchErr.message });
    if (!openInvoices?.length) return json(200, { ok: true, checked: 0, settled: 0, message: "No hay facturas OPEN que revisar" });

    // Load all CNs grouped by client for quick lookup
    const clientIds = [...new Set(openInvoices.map((i: any) => i.client_id).filter(Boolean))];
    const { data: allCNs } = clientIds.length > 0
      ? await supa
          .from("invoices")
          .select("client_id, invoice_date, invoice_number, total_net, total_gross")
          .eq("source_provider", "holded")
          .eq("document_type", "creditnote")
          .in("client_id", clientIds)
      : { data: [] };

    const cnsByClient = new Map<string, { invoice_date: string; total_gross: number; invoice_number: string }[]>();
    for (const cn of (allCNs ?? []) as any[]) {
      if (!cn.client_id) continue;
      const abs = Math.abs(parseFloat(cn.total_gross) || 0);
      if (!cnsByClient.has(cn.client_id)) cnsByClient.set(cn.client_id, []);
      cnsByClient.get(cn.client_id)!.push({ ...cn, total_gross: abs });
    }

    let checked = 0;
    let settled = 0;
    let errors = 0;
    const details: { invoice_number: string; action: string; paid_date: string | null; cn_match?: string }[] = [];

    for (const inv of openInvoices as any[]) {
      checked++;
      const totalGross = parseFloat(inv.total_gross) || 0;

      const detail = await fetchHoldedDetail(inv.external_invoice_id);
      if (!detail) { errors++; continue; }

      const { isPaid, paidDate: rawPaidDate, paymentsTotal, paymentsPending } = extractPaidState(detail, totalGross);

      if (!isPaid) continue;

      // Resolve paid_date: use paymentsDetail if available, otherwise find matching CN
      let paidDate = rawPaidDate;
      let cnMatch: string | undefined;

      if (!paidDate && inv.client_id) {
        // CN-settled: find the CN for this client with closest amount
        const clientCNs = cnsByClient.get(inv.client_id) ?? [];
        const matching = clientCNs
          .filter((cn) => Math.abs(cn.total_gross - totalGross) <= EPSILON + 0.05)
          .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date)); // most recent first

        if (matching.length > 0) {
          paidDate = matching[0].invoice_date;
          cnMatch = matching[0].invoice_number;
        }
      }

      // Update invoice
      const { error: updateErr } = await supa
        .from("invoices")
        .update({
          is_paid: true,
          state_code: "SETTLED",
          paid_date: paidDate,
          updated_at: now,
          // Record reconciliation info in source_meta patch
          needs_review: !paidDate, // flag for manual review if we still couldn't get paid_date
        })
        .eq("id", inv.id);

      if (updateErr) {
        errors++;
        continue;
      }

      settled++;
      details.push({
        invoice_number: inv.invoice_number,
        action: cnMatch ? `settled_via_cn:${cnMatch}` : "settled_payments_total",
        paid_date: paidDate,
        cn_match: cnMatch,
      });
    }

    return json(200, {
      ok: true,
      checked,
      settled,
      errors,
      remaining_open: (openInvoices.length) - settled,
      details,
    });
  } catch (err: unknown) {
    return json(500, { ok: false, error: String(err) });
  }
}
