import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getMonthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(y, m - 1, 1));
  const endDate = new Date(Date.UTC(y, m, 1));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

function getMadridToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function normalizeMonth(input: unknown): string {
  const s = String(input ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

// Days between two YYYY-MM-DD strings (positive = dateA is later)
function diffDays(dateA: string, dateB: string): number {
  return Math.floor(
    (new Date(`${dateA}T00:00:00Z`).getTime() - new Date(`${dateB}T00:00:00Z`).getTime()) / 86400000
  );
}

async function safeJson(request: NextRequest, path: string): Promise<any | null> {
  try {
    const url = new URL(path, request.nextUrl.origin);
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { cookie: request.headers.get("cookie") || "" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = normalizeMonth(monthParam);
  const { start, end } = getMonthBounds(month);
  const today = getMadridToday();

  const ctx = await resolveDashboardContext(request);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal && !ctx.permissions.canViewFinance) {
    return json(403, { ok: false, error: "Acceso restringido" });
  }

  const supa = ctx.supaService;

  // Load all invoices that are relevant:
  // - emitted in period (by invoice_date)
  // - paid in period (by paid_date)
  // - all currently unpaid (regardless of period)
  const { data: rows, error } = await supa
    .from("invoices")
    .select("id, invoice_date, paid_date, is_paid, total_net, document_type")
    .or(`invoice_date.gte.${start},paid_date.gte.${start},is_paid.is.false,is_paid.is.null`)
    .limit(10000);

  if (error) return json(500, { ok: false, error: error.message });

  const invoices: any[] = Array.isArray(rows) ? rows : [];

  // Filter to only regular invoices (not credit notes)
  const regular = invoices.filter(
    (r) => r.document_type !== "creditnote" && r.document_type !== "credit_note"
  );

  // Emitidas en el periodo
  const emitted = regular.filter(
    (r) => r.invoice_date >= start && r.invoice_date < end
  );

  // Cobradas en el periodo
  const paid = regular.filter(
    (r) => r.paid_date && r.paid_date >= start && r.paid_date < end && r.is_paid === true
  );

  // Impagadas (todas, independiente del periodo)
  const unpaid = regular.filter((r) => !r.is_paid && r.invoice_date);

  // Pendientes: impagadas cuya invoice_date está dentro de los últimos 30 días (Net30)
  const pending = unpaid.filter((r) => diffDays(today, r.invoice_date) <= 30);

  // Vencidas: impagadas con más de 30 días desde invoice_date (Net30 superado)
  const overdue = unpaid.filter((r) => diffDays(today, r.invoice_date) > 30);

  function sum(arr: any[]): number {
    return Number(arr.reduce((s, r) => s + toNum(r.total_net, 0), 0).toFixed(2));
  }

  // Units sold: use existing month KPI endpoint (already has the RPC result)
  const monthKpi = await safeJson(request, `/api/control-room/month?month=${month}-01`);
  const units_sold = toNum(monthKpi?.units_sold, 0);

  return json(200, {
    ok: true,
    month,
    units_sold,
    emitted: { count: emitted.length, amount: sum(emitted) },
    paid: { count: paid.length, amount: sum(paid) },
    pending: { count: pending.length, amount: sum(pending) },
    overdue: { count: overdue.length, amount: sum(overdue) },
  });
}
