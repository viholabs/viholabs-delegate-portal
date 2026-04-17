// src/app/api/control-room/delegates/[id]/settlement/pdf/route.ts
// GET /api/control-room/delegates/[id]/settlement/pdf?month=YYYY-MM
// Genera y devuelve el PDF de la propuesta de liquidación del periodo indicado.

import { NextResponse } from "next/server";
import { PDFDocument, PDFPage, rgb, StandardFonts, RGB } from "pdf-lib";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSupervisorRole, normalizeRole } from "@/lib/auth/roles";
import { asString, asNumber } from "@/lib/holded/holdedPrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceRow = {
  invoice_number: string;
  invoice_date: string | null;
  paid_date: string | null;
  client_name: string;
  units_sold: number;
  units_foc: number;
  status: "LIQUIDABLE" | "PENDING" | "OVERDUE";
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function err(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// Standard PDF fonts only support WinAnsi (Windows-1252).
function safePdfText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")        // strip combining diacritics (accents)
    .replace(/€/g, "EUR")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"');
}

function fmt(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const parts = abs.toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${intPart},${parts[1]} EUR`;
}

function fmtShort(n: number) {
  // Same as fmt but without the EUR suffix — for narrow table cells.
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const parts = abs.toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${intPart},${parts[1]}`;
}

function fmtUnits(n: number) {
  return String(Math.round(n)) + " ud.";
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(iso);
  }
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return String(iso);
  }
}

function truncText(s: string, maxChars: number): string {
  const safe = safePdfText(s);
  return safe.length > maxChars ? safe.slice(0, maxChars - 1) + "~" : safe;
}

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function fmtMonth(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-");
  const monthName = MONTHS[Number(m) - 1] ?? m;
  return `${monthName} ${y}`;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    DRAFT: "Borrador",
    PENDING_VALIDATION: "Pendiente validacion",
    VALIDATED: "Validada",
    NOTIFIED: "Notificada",
    ACCEPTED: "Aceptada",
    IN_REVIEW: "En revision",
    REISSUED: "Reemitida",
    CLOSED: "Cerrada",
  };
  return map[s] ?? s;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: delegateId } = await ctx.params;
    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? "";

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return err(400, "Parámetro month requerido (YYYY-MM)");
    }

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean; status?: number; error?: string; actor?: unknown;
    };
    if (!auth?.ok) return err(auth?.status ?? 401, auth?.error ?? "Unauthorized");

    const requestingActor = (auth.actor as Record<string, unknown> | null | undefined);
    const role = normalizeRole(requestingActor?.role);
    const isDelegate = role === "DELEGATE";
    if (!isSupervisorRole(role) && !isDelegate) return err(403, "Forbidden");
    if (isDelegate && asString(requestingActor?.id) !== delegateId) return err(403, "Forbidden");

    const db = supabaseAdmin();

    // ── Proposal ──────────────────────────────────────────────────────────────
    const { data: proposal, error: propErr } = await db
      .from("commission_settlement_proposals")
      .select("*")
      .eq("actor_id", delegateId)
      .eq("period_yyyy_mm", month)
      .eq("state_code", "OPEN")
      .maybeSingle();

    if (propErr) return err(500, propErr.message);
    if (!proposal) return err(404, `No existe propuesta de liquidación para ${month}`);

    const p = proposal as Record<string, unknown>;

    // ── Delegate actor ────────────────────────────────────────────────────────
    const { data: actorRow } = await db
      .from("actors")
      .select("name, email")
      .eq("id", delegateId)
      .maybeSingle();

    const delegateName = asString((actorRow as Record<string, unknown> | null)?.name) ?? delegateId;
    const delegateEmail = asString((actorRow as Record<string, unknown> | null)?.email) ?? "";

    // ── Commission tier ───────────────────────────────────────────────────────
    const { data: rulesData } = await db
      .from("commission_rules_delegates")
      .select("from_units, to_units, percentage, reference_price, delegate_id, channel")
      .or(`delegate_id.eq.${delegateId},delegate_id.is.null`)
      .eq("active", true)
      .order("from_units", { ascending: true });

    const rules = (rulesData ?? []) as Array<Record<string, unknown>>;
    const pdvRules = rules
      .sort((a, b) => {
        if (a.delegate_id && !b.delegate_id) return -1;
        if (!a.delegate_id && b.delegate_id) return 1;
        return (asNumber(a.from_units) ?? 0) - (asNumber(b.from_units) ?? 0);
      })
      .filter((r) => (asString(r.channel) ?? "").toLowerCase() === "pdv");

    const totalUnits = asNumber(p.total_units_sold_paid) ?? 0;
    const applicable = pdvRules.find((r) =>
      totalUnits >= (asNumber(r.from_units) ?? 0) &&
      totalUnits <= (asNumber(r.to_units) ?? 0)
    ) ?? pdvRules[0] ?? null;

    const pct      = applicable ? (asNumber(applicable.percentage) ?? 0) : 0;
    const refPrice = applicable ? (asNumber(applicable.reference_price) ?? 31) : 31;
    const tierFrom = applicable ? Math.round(asNumber(applicable.from_units) ?? 0) : 0;
    const tierTo   = applicable ? Math.round(asNumber(applicable.to_units) ?? 0) : 0;
    const tierLabel = applicable ? `${pct}% (${tierFrom}-${tierTo} ud)` : "Sin tier";

    // ── Invoice list for page 2 ───────────────────────────────────────────────
    const [yearStr, monthStr] = month.split("-");
    const periodStart = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1)).toISOString().slice(0, 10);
    const periodEnd   = new Date(Date.UTC(Number(yearStr), Number(monthStr), 1)).toISOString().slice(0, 10);

    // Get client IDs
    const { data: assignmentsData } = await db
      .from("client_actor_assignments_g1")
      .select("client_holded_contact_id")
      .eq("actor_id", delegateId)
      .eq("assignment_role", "delegate")
      .is("valid_to", null);

    const holdedIds = [...new Set(
      (assignmentsData ?? [])
        .map((r) => asString((r as Record<string, unknown>).client_holded_contact_id))
        .filter((v): v is string => !!v)
    )];

    let invoiceRows: InvoiceRow[] = [];

    if (holdedIds.length > 0) {
      const { data: clientsData } = await db
        .from("clients")
        .select("id")
        .in("holded_contact_id", holdedIds)
        .in("state_code", ["OPEN", "ACTIVE"]);

      const clientIds = (clientsData ?? [])
        .map((r) => asString((r as Record<string, unknown>).id))
        .filter((v): v is string => !!v);

      if (clientIds.length > 0) {
        // Paid in period (liquidable) + unpaid — both regular invoices only
        const [paidRes, unpaidRes] = await Promise.all([
          db.from("invoices")
            .select("id, invoice_number, invoice_date, paid_date, client_name, total_net")
            .in("client_id", clientIds)
            .eq("is_paid", true)
            .eq("document_type", "invoice")
            .not("paid_date", "is", null)
            .gte("paid_date", periodStart)
            .lt("paid_date", periodEnd)
            .order("invoice_date"),
          db.from("invoices")
            .select("id, invoice_number, invoice_date, paid_date, client_name, total_net")
            .in("client_id", clientIds)
            .eq("is_paid", false)
            .eq("document_type", "invoice")
            .in("state_code", ["OPEN", "ACTIVE"])
            .order("invoice_date"),
        ]);

        const allInvoices = [
          ...(paidRes.data ?? []).map((r) => ({ ...(r as Record<string, unknown>), _paid: true })),
          ...(unpaidRes.data ?? []).map((r) => ({ ...(r as Record<string, unknown>), _paid: false })),
        ] as Array<Record<string, unknown> & { _paid: boolean }>;

        // Fetch items for all invoices
        const allIds = allInvoices.map((r) => asString(r.id)).filter((v): v is string => !!v);
        const itemsByInvoice = new Map<string, { units_sold: number; units_foc: number }>();

        if (allIds.length > 0) {
          const { data: itemsData } = await db
            .from("invoice_items")
            .select("invoice_id, units, line_type")
            .in("invoice_id", allIds)
            .eq("state_code", "OPEN");

          for (const item of (itemsData ?? [])) {
            const r = item as Record<string, unknown>;
            const invId = asString(r.invoice_id);
            if (!invId) continue;
            if (!itemsByInvoice.has(invId)) itemsByInvoice.set(invId, { units_sold: 0, units_foc: 0 });
            const agg = itemsByInvoice.get(invId)!;
            const lt = (asString(r.line_type) ?? "").toLowerCase();
            const u = asNumber(r.units) ?? 0;
            if (lt === "promo" || lt === "promotion" || lt === "foc") agg.units_foc += u;
            else agg.units_sold += u;
          }
        }

        const todayDate = new Date();
        const DUE_DAYS = 30;

        for (const inv of allInvoices) {
          const id = asString(inv.id) ?? "";
          const isPaid = inv._paid === true;
          const invDateStr = asString(inv.invoice_date);

          let status: InvoiceRow["status"];
          if (isPaid) {
            status = "LIQUIDABLE";
          } else {
            const invDate = invDateStr ? new Date(invDateStr) : null;
            const dueDate = invDate ? new Date(invDate.getTime() + DUE_DAYS * 86400000) : null;
            status = dueDate && todayDate > dueDate ? "OVERDUE" : "PENDING";
          }

          const agg = itemsByInvoice.get(id) ?? { units_sold: 0, units_foc: 0 };
          invoiceRows.push({
            invoice_number: asString(inv.invoice_number) ?? "-",
            invoice_date: invDateStr ?? null,
            paid_date: asString(inv.paid_date) ?? null,
            client_name: asString(inv.client_name) ?? "-",
            units_sold: agg.units_sold,
            units_foc: agg.units_foc,
            status,
          });
        }

        // Sort: LIQUIDABLE → PENDING → OVERDUE, then by date
        const ORDER = { LIQUIDABLE: 0, PENDING: 1, OVERDUE: 2 };
        invoiceRows.sort((a, b) => {
          const ds = ORDER[a.status] - ORDER[b.status];
          if (ds !== 0) return ds;
          return (a.invoice_date ?? "").localeCompare(b.invoice_date ?? "");
        });
      }
    }

    // ── Build PDF ─────────────────────────────────────────────────────────────
    const doc = await PDFDocument.create();

    const fontReg  = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PURPLE   = rgb(0.42, 0.18, 0.72);
    const DARK     = rgb(0.13, 0.13, 0.20);
    const MUTED    = rgb(0.45, 0.45, 0.52);
    const WHITE    = rgb(1, 1, 1);
    const LIGHT_BG = rgb(0.97, 0.96, 0.99);
    const BORDER   = rgb(0.88, 0.86, 0.92);
    const GREEN    = rgb(0.06, 0.58, 0.38);
    const BLUE     = rgb(0.12, 0.40, 0.80);
    const RED      = rgb(0.78, 0.08, 0.08);

    const ROW_BG_GREEN = rgb(0.88, 0.97, 0.91);
    const ROW_BG_BLUE  = rgb(0.89, 0.93, 0.99);
    const ROW_BG_RED   = rgb(0.99, 0.90, 0.89);

    const PAGE_W = 595;
    const PAGE_H = 842;

    // ─────────────────────────────────────────────────────────────────────────
    // PAGE 1 — Summary
    // ─────────────────────────────────────────────────────────────────────────
    const page1 = doc.addPage([PAGE_W, PAGE_H]);
    const { width, height } = page1.getSize();
    let y = height - 48;

    // Header bar
    page1.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: PURPLE });
    page1.drawText("VIHOLABS", { x: 36, y: height - 36, size: 18, font: fontBold, color: WHITE });
    page1.drawText("Portal de Delegados", { x: 36, y: height - 54, size: 9, font: fontReg, color: rgb(0.85, 0.80, 0.95) });

    const docTitle = "PROPUESTA DE LIQUIDACION";
    const titleW = fontBold.widthOfTextAtSize(docTitle, 12);
    page1.drawText(docTitle, { x: width - 36 - titleW, y: height - 40, size: 12, font: fontBold, color: WHITE });
    const periodLabel = safePdfText(fmtMonth(asString(p.period_yyyy_mm) ?? month));
    const periodW = fontReg.widthOfTextAtSize(periodLabel, 9);
    page1.drawText(periodLabel, { x: width - 36 - periodW, y: height - 56, size: 9, font: fontReg, color: rgb(0.85, 0.80, 0.95) });

    y = height - 100;

    // Delegate + status
    page1.drawText("Delegado", { x: 36, y, size: 8, font: fontBold, color: MUTED });
    y -= 14;
    page1.drawText(safePdfText(delegateName), { x: 36, y, size: 14, font: fontBold, color: DARK });
    if (delegateEmail) {
      y -= 14;
      page1.drawText(safePdfText(delegateEmail), { x: 36, y, size: 9, font: fontReg, color: MUTED });
    }

    const status = asString(p.status) ?? "DRAFT";
    const statusText = statusLabel(status);
    const badgeW = fontBold.widthOfTextAtSize(statusText, 9) + 20;
    const badgeX = width - 36 - badgeW;
    const badgeY = height - 108;
    page1.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: 22, color: LIGHT_BG, borderColor: BORDER, borderWidth: 1 });
    page1.drawText(statusText, { x: badgeX + 10, y: badgeY + 7, size: 9, font: fontBold, color: PURPLE });

    y -= 24;

    // Divider
    page1.drawLine({ start: { x: 36, y }, end: { x: width - 36, y }, thickness: 0.5, color: BORDER });
    y -= 20;

    // KPI grid
    const kpiData = [
      { label: "UNIDADES LIQUIDABLES", value: fmtUnits(asNumber(p.total_units_sold_paid) ?? 0), sub: "Ud. cobradas", color: DARK },
      { label: "UD. PROMO / FOC", value: fmtUnits(asNumber(p.total_units_foc) ?? 0), sub: "No comisionan", color: MUTED },
      { label: "BASE COMISIONABLE", value: fmt(asNumber(p.total_net_commissionable) ?? 0), sub: "Neto calculado", color: GREEN },
      { label: "COMISION CALCULADA", value: fmt(asNumber(p.total_commission_amount) ?? 0), sub: tierLabel, color: BLUE },
    ];
    const cellW = (width - 72 - 12) / 4;
    const cellH = 70;
    const kpiTop = y;
    kpiData.forEach((kpi, i) => {
      const cx = 36 + i * (cellW + 4);
      const cy = kpiTop - cellH;
      page1.drawRectangle({ x: cx, y: cy, width: cellW, height: cellH, color: LIGHT_BG, borderColor: BORDER, borderWidth: 0.8 });
      page1.drawText(kpi.label, { x: cx + 10, y: cy + cellH - 16, size: 7, font: fontBold, color: MUTED });
      page1.drawText(kpi.value, { x: cx + 10, y: cy + 24, size: 14, font: fontBold, color: kpi.color });
      page1.drawText(kpi.sub, { x: cx + 10, y: cy + 10, size: 8, font: fontReg, color: MUTED });
    });
    y = kpiTop - cellH - 20;

    // Summary box
    const sumBoxH = 80;
    page1.drawRectangle({ x: 36, y: y - sumBoxH, width: width - 72, height: sumBoxH, color: LIGHT_BG, borderColor: PURPLE, borderWidth: 1.2 });
    const sumCols = [
      { label: "Comision calculada", value: fmt(asNumber(p.total_commission_amount) ?? 0) },
      { label: "Ajustes", value: fmt(asNumber(p.total_adjustments_amount) ?? 0) },
      { label: "TOTAL A LIQUIDAR", value: fmt(asNumber(p.total_payable_amount) ?? 0), highlight: true },
    ];
    const colW = (width - 72) / 3;
    sumCols.forEach((col, i) => {
      const cx = 36 + i * colW + 16;
      const cy = y - sumBoxH;
      page1.drawText(col.label.toUpperCase(), { x: cx, y: cy + sumBoxH - 18, size: 7.5, font: fontBold, color: col.highlight ? PURPLE : MUTED });
      page1.drawText(col.value, { x: cx, y: cy + 28, size: col.highlight ? 18 : 14, font: fontBold, color: col.highlight ? PURPLE : DARK });
    });
    y -= sumBoxH + 20;

    // Detail table
    page1.drawText("DESGLOSE", { x: 36, y, size: 8, font: fontBold, color: MUTED });
    y -= 14;
    const detailRows: [string, string][] = [
      ["Periodo", safePdfText(fmtMonth(asString(p.period_yyyy_mm) ?? month))],
      ["Unidades liquidables", fmtUnits(asNumber(p.total_units_sold_paid) ?? 0)],
      ["Unidades promo / FOC", fmtUnits(asNumber(p.total_units_foc) ?? 0)],
      ["Base comisionable neta", fmt(asNumber(p.total_net_commissionable) ?? 0)],
      ["Comision calculada", fmt(asNumber(p.total_commission_amount) ?? 0)],
      ["Tramo aplicado", tierLabel],
      ["Ajustes manuales", fmt(asNumber(p.total_adjustments_amount) ?? 0)],
      ["Total propuesto a liquidar", fmt(asNumber(p.total_payable_amount) ?? 0)],
      ["Estado de la propuesta", statusLabel(status)],
      ["Version de reglas", safePdfText(asString(p.ruleset_version) ?? "-")],
      ["Corte de datos", fmtDate(asString(p.data_cutoff_at))],
      ["Creada", fmtDate(asString(p.created_at))],
      ["Ultima actualizacion", fmtDate(asString(p.updated_at))],
    ];
    const rowH = 20;
    const col1W = 200;
    detailRows.forEach((row, i) => {
      const rowY = y - i * rowH;
      const bg = i % 2 === 0 ? LIGHT_BG : WHITE;
      page1.drawRectangle({ x: 36, y: rowY - rowH + 4, width: width - 72, height: rowH, color: bg });
      page1.drawText(row[0], { x: 48, y: rowY - 10, size: 9, font: fontBold, color: DARK });
      page1.drawText(row[1], { x: 36 + col1W, y: rowY - 10, size: 9, font: fontReg, color: DARK });
    });
    y -= detailRows.length * rowH + 24;

    // Footer page 1
    page1.drawLine({ start: { x: 36, y: y + 10 }, end: { x: width - 36, y: y + 10 }, thickness: 0.5, color: BORDER });
    y -= 4;
    const proposalId = asString(p.id) ?? "";
    page1.drawText(`ID propuesta: ${proposalId}`, { x: 36, y, size: 7.5, font: fontReg, color: MUTED });
    const d = new Date();
    const pad = (v: number) => String(v).padStart(2, "0");
    const generated = `Generado: ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const genW = fontReg.widthOfTextAtSize(generated, 7.5);
    page1.drawText(generated, { x: width - 36 - genW, y, size: 7.5, font: fontReg, color: MUTED });

    page1.drawRectangle({ x: 0, y: 0, width, height: 28, color: PURPLE });
    page1.drawText("Viholabs - Portal de Delegados - Propuesta formal de liquidacion de comisiones.", {
      x: 36, y: 9, size: 7, font: fontReg, color: rgb(0.85, 0.80, 0.95),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PAGE 2+ — Invoice table
    // ─────────────────────────────────────────────────────────────────────────

    // Column layout (total usable width: 559 - 36 = 523px)
    // x positions are absolute on the page
    // "% tramo" moved to section header (same for all rows) → replaced by "Fecha cobro"
    const COL = {
      fecha:   { x: 36,  w: 52 },   // DD/MM/YYYY emisión
      factura: { x: 88,  w: 62 },   // Nº factura
      cliente: { x: 150, w: 105 },  // Cliente (truncated)
      udVend:  { x: 255, w: 36 },   // Ud. vendidas (right-align)
      udPromo: { x: 291, w: 36 },   // Ud. promo (right-align)
      base:    { x: 327, w: 70 },   // Base com. = ud×31 (right-align)
      cobro:   { x: 397, w: 70 },   // Fecha de cobro (DD/MM/YYYY)
      comNeto: { x: 467, w: 92 },   // Comisión neta (right-align)
    };

    // Current drawing page and y cursor — initialized by addInvoicePage() before first use
    let curPage: PDFPage = null!;
    let cy = 0;

    function addInvoicePage() {
      curPage = doc.addPage([PAGE_W, PAGE_H]);

      // Purple header bar
      curPage.drawRectangle({ x: 0, y: PAGE_H - 48, width: PAGE_W, height: 48, color: PURPLE });
      curPage.drawText("VIHOLABS", { x: 36, y: PAGE_H - 30, size: 14, font: fontBold, color: WHITE });
      const lbl = `DETALLE DE FACTURAS — ${safePdfText(fmtMonth(month))}`;
      const lblW = fontBold.widthOfTextAtSize(lbl, 9);
      curPage.drawText(lbl, { x: PAGE_W - 36 - lblW, y: PAGE_H - 30, size: 9, font: fontBold, color: WHITE });
      const pg = safePdfText(`Delegado: ${delegateName}   |   Tramo aplicado: ${tierLabel}   |   Precio ref.: ${refPrice} EUR/ud`);
      curPage.drawText(pg, { x: 36, y: PAGE_H - 42, size: 7.5, font: fontReg, color: rgb(0.85, 0.80, 0.95) });

      // Bottom bar
      curPage.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 20, color: PURPLE });
      curPage.drawText("Viholabs - Portal de Delegados - Propuesta formal de liquidacion de comisiones.", {
        x: 36, y: 6, size: 6.5, font: fontReg, color: rgb(0.85, 0.80, 0.95),
      });

      cy = PAGE_H - 60;
    }

    function drawTableHeader() {
      const hh = 16; // header row height
      curPage.drawRectangle({ x: 36, y: cy - hh, width: PAGE_W - 72, height: hh, color: PURPLE });

      const headers: Array<{ label: string; col: keyof typeof COL; align: "left" | "right" | "center" }> = [
        { label: "FECHA EMIS.", col: "fecha",   align: "left"   },
        { label: "N. FACTURA",  col: "factura", align: "left"   },
        { label: "CLIENTE",     col: "cliente", align: "left"   },
        { label: "UD.VEND.",    col: "udVend",  align: "right"  },
        { label: "UD.PROMO",    col: "udPromo", align: "right"  },
        { label: `BASE(x${refPrice})`, col: "base", align: "right" },
        { label: "FECHA COBRO", col: "cobro",   align: "left"   },
        { label: "COMISION",    col: "comNeto", align: "right"  },
      ];

      for (const h of headers) {
        const c = COL[h.col];
        const sz = 6.5;
        const tw = fontBold.widthOfTextAtSize(h.label, sz);
        let tx: number;
        if (h.align === "right")       tx = c.x + c.w - tw - 3;
        else if (h.align === "center") tx = c.x + (c.w - tw) / 2;
        else                           tx = c.x + 3;
        curPage.drawText(h.label, { x: tx, y: cy - hh + 4, size: sz, font: fontBold, color: WHITE });
      }

      cy -= hh;
    }

    function drawLegend() {
      const items: Array<{ label: string; color: RGB }> = [
        { label: "Liquidable (cobrada en periodo)", color: GREEN },
        { label: "Pendiente de cobro",              color: BLUE  },
        { label: "Vencida sin cobrar",              color: RED   },
      ];
      let lx = 36;
      for (const item of items) {
        curPage.drawRectangle({ x: lx, y: cy - 8, width: 8, height: 8, color: item.color });
        const lbl = item.label;
        curPage.drawText(lbl, { x: lx + 11, y: cy - 7, size: 7, font: fontReg, color: DARK });
        lx += fontReg.widthOfTextAtSize(lbl, 7) + 22;
      }
      cy -= 16;
    }

    function drawInvoiceRow(inv: InvoiceRow) {
      const ROW_H = 15;
      const MARGIN_BOTTOM = 36; // leave space for bottom bar

      // New page if needed
      if (cy - ROW_H < MARGIN_BOTTOM) {
        addInvoicePage();
        drawTableHeader();
      }

      const rowBg = inv.status === "LIQUIDABLE" ? ROW_BG_GREEN
                  : inv.status === "OVERDUE"    ? ROW_BG_RED
                  :                               ROW_BG_BLUE;
      const accentColor = inv.status === "LIQUIDABLE" ? GREEN
                        : inv.status === "OVERDUE"    ? RED
                        :                               BLUE;

      curPage.drawRectangle({ x: 36, y: cy - ROW_H, width: PAGE_W - 72, height: ROW_H, color: rowBg });

      const textY = cy - ROW_H + 4;
      const SZ = 7;

      // Fecha
      curPage.drawText(fmtDateShort(inv.invoice_date), {
        x: COL.fecha.x + 3, y: textY, size: SZ, font: fontReg, color: DARK,
      });

      // Nº Factura
      curPage.drawText(truncText(inv.invoice_number, 9), {
        x: COL.factura.x + 3, y: textY, size: SZ, font: fontBold, color: accentColor,
      });

      // Cliente (truncated)
      curPage.drawText(truncText(inv.client_name, 17), {
        x: COL.cliente.x + 3, y: textY, size: SZ, font: fontReg, color: DARK,
      });

      // Ud. vendidas (right-align)
      const udVText = String(inv.units_sold);
      const udVW = fontBold.widthOfTextAtSize(udVText, SZ);
      curPage.drawText(udVText, {
        x: COL.udVend.x + COL.udVend.w - udVW - 3, y: textY, size: SZ, font: fontBold,
        color: inv.units_sold > 0 ? DARK : MUTED,
      });

      // Ud. promo (right-align)
      if (inv.units_foc > 0) {
        const udPText = String(inv.units_foc);
        const udPW = fontReg.widthOfTextAtSize(udPText, SZ);
        curPage.drawText(udPText, {
          x: COL.udPromo.x + COL.udPromo.w - udPW - 3, y: textY, size: SZ, font: fontReg, color: MUTED,
        });
      }

      // Base comisionable = units_sold × refPrice (right-align)
      const base = inv.units_sold * refPrice;
      const baseText = fmtShort(base);
      const baseW = fontReg.widthOfTextAtSize(baseText, SZ);
      curPage.drawText(baseText, {
        x: COL.base.x + COL.base.w - baseW - 3, y: textY, size: SZ, font: fontReg, color: DARK,
      });

      // Fecha de cobro
      const cobroText = inv.paid_date ? fmtDateShort(inv.paid_date) : "—";
      const cobroColor = inv.status === "LIQUIDABLE" ? GREEN : MUTED;
      curPage.drawText(cobroText, {
        x: COL.cobro.x + 3, y: textY, size: SZ, font: inv.paid_date ? fontBold : fontReg, color: cobroColor,
      });

      // Comisión neta = base × pct/100 (right-align)
      const comNeto = base * pct / 100;
      const comText = fmtShort(comNeto);
      const comW = fontBold.widthOfTextAtSize(comText, SZ);
      curPage.drawText(comText, {
        x: COL.comNeto.x + COL.comNeto.w - comW - 3, y: textY, size: SZ, font: fontBold,
        color: inv.status === "LIQUIDABLE" ? GREEN : MUTED,
      });

      cy -= ROW_H;
    }

    function drawTotalsRow(rows: InvoiceRow[]) {
      const liquidable = rows.filter((r) => r.status === "LIQUIDABLE");
      const totUnits   = liquidable.reduce((s, r) => s + r.units_sold, 0);
      const totFoc     = liquidable.reduce((s, r) => s + r.units_foc, 0);
      const totBase    = totUnits * refPrice;
      const totCom     = totBase * pct / 100;

      const ROW_H = 17;
      if (cy - ROW_H < 36) { addInvoicePage(); }

      curPage.drawRectangle({ x: 36, y: cy - ROW_H, width: PAGE_W - 72, height: ROW_H, color: LIGHT_BG, borderColor: BORDER, borderWidth: 0.5 });

      const textY = cy - ROW_H + 5;
      const SZ = 7.5;

      curPage.drawText("TOTAL LIQUIDABLE", { x: COL.fecha.x + 3, y: textY, size: SZ, font: fontBold, color: DARK });

      const tuW = fontBold.widthOfTextAtSize(String(totUnits), SZ);
      curPage.drawText(String(totUnits), { x: COL.udVend.x + COL.udVend.w - tuW - 3, y: textY, size: SZ, font: fontBold, color: DARK });

      const tfW = fontBold.widthOfTextAtSize(String(totFoc), SZ);
      curPage.drawText(String(totFoc), { x: COL.udPromo.x + COL.udPromo.w - tfW - 3, y: textY, size: SZ, font: fontBold, color: DARK });

      const tbText = fmtShort(totBase);
      const tbW = fontBold.widthOfTextAtSize(tbText, SZ);
      curPage.drawText(tbText, { x: COL.base.x + COL.base.w - tbW - 3, y: textY, size: SZ, font: fontBold, color: GREEN });

      const tcText = fmt(totCom);
      const tcW = fontBold.widthOfTextAtSize(tcText, SZ);
      curPage.drawText(tcText, { x: COL.comNeto.x + COL.comNeto.w - tcW - 3, y: textY, size: SZ, font: fontBold, color: GREEN });

      cy -= ROW_H;
    }

    // Render page 2
    addInvoicePage();

    // Legend
    drawLegend();

    // Separator
    curPage!.drawLine({ start: { x: 36, y: cy }, end: { x: PAGE_W - 36, y: cy }, thickness: 0.4, color: BORDER });
    cy -= 8;

    // Table header
    drawTableHeader();

    // Rows
    if (invoiceRows.length === 0) {
      curPage!.drawText("No se encontraron facturas para este periodo.", {
        x: 36, y: cy - 16, size: 9, font: fontReg, color: MUTED,
      });
    } else {
      for (const row of invoiceRows) {
        drawInvoiceRow(row);
      }

      // Thin divider before totals
      curPage!.drawLine({ start: { x: 36, y: cy - 2 }, end: { x: PAGE_W - 36, y: cy - 2 }, thickness: 0.5, color: BORDER });
      cy -= 8;
      drawTotalsRow(invoiceRows);
    }

    // ── Serialize ─────────────────────────────────────────────────────────────
    const pdfBytes = await doc.save();

    const safeFilename = delegateName
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    const filename = `liquidacion_${safeFilename}_${month}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : "Error generando PDF");
  }
}
