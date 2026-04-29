"use client";

// src/components/control-room/delegates/detail/TabFacturacion.tsx
// Tabla de facturas del delegado.
// Orden por defecto: Vencidas → Pendientes → Cobradas en periodo → Cobradas otros periodos
// Panel superior: métricas de bono con acumulados trimestrales y anuales.

import { useState } from "react";
import type { DetailInvoiceRow, DetailPeriodStats, CommissionRule } from "../types";
import { formatMoney, formatDate, formatMonthLabel, paymentStatusBadge } from "../utils";

type Filter = "all" | "PAID_IN_PERIOD" | "PAID_OTHER" | "PENDING" | "OVERDUE" | "CREDIT_NOTE";

type Props = {
  invoices: DetailInvoiceRow[];
  month: string;
  period: DetailPeriodStats;
  commissionRules: CommissionRule[];
};

// ---------------------------------------------------------------------------
// Bonus metrics helpers
// ---------------------------------------------------------------------------

function getQuarterLabel(month: string): string {
  const m = Number(month.split("-")[1]);
  const q = Math.ceil(m / 3);
  return `Q${q} ${month.split("-")[0]}`;
}

function getNextTier(
  units: number,
  delegateId: string | null,
  rules: CommissionRule[]
): { threshold: number; pct: number } | null {
  const pdv = rules
    .filter((r) => r.channel.toLowerCase() === "pdv" && r.active)
    .sort((a, b) => {
      if (a.delegate_id && !b.delegate_id) return -1;
      if (!a.delegate_id && b.delegate_id) return 1;
      return a.from_units - b.from_units;
    })
    .filter((r) => !r.delegate_id || r.delegate_id === delegateId);

  // Find the next tier above current units
  const next = pdv.find((r) => r.from_units > units);
  if (!next) return null;
  return { threshold: next.from_units, pct: next.percentage };
}

function progressColor(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-violet-500";
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<string, number> = {
  OVERDUE: 0,
  PENDING: 1,
  PAID_IN_PERIOD: 2,
  PAID_OTHER: 3,
  CREDIT_NOTE: 4,
};

function sortKey(inv: DetailInvoiceRow): [number, string] {
  if (inv.payment_status === "OVERDUE") {
    // Most overdue first (highest days_overdue)
    return [0, String(999999 - (inv.days_overdue ?? 0)).padStart(9, "0")];
  }
  if (inv.payment_status === "PENDING") {
    // Closest due date first (invoice_date + 30d → smallest = most urgent)
    return [1, inv.invoice_date ?? "9999-12-31"];
  }
  const bucket = inv.paid_in_period ? 2 : STATUS_ORDER[inv.payment_status] ?? 4;
  return [bucket, inv.invoice_date ?? ""];
}

function sortInvoices(list: DetailInvoiceRow[]): DetailInvoiceRow[] {
  return [...list].sort((a, b) => {
    const [oa, ka] = sortKey(a);
    const [ob, kb] = sortKey(b);
    if (oa !== ob) return oa - ob;
    return ka.localeCompare(kb);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TabFacturacion({ invoices, month, period, commissionRules }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const paidInPeriod = invoices.filter((i) => i.payment_status === "PAID" && i.paid_in_period);
  const paidOther    = invoices.filter((i) => i.payment_status === "PAID" && !i.paid_in_period);
  const pending      = invoices.filter((i) => i.payment_status === "PENDING");
  const overdue      = invoices.filter((i) => i.payment_status === "OVERDUE");
  const cns          = invoices.filter((i) => i.payment_status === "CREDIT_NOTE");

  const baseFiltered =
    filter === "all"            ? invoices :
    filter === "PAID_IN_PERIOD" ? paidInPeriod :
    filter === "PAID_OTHER"     ? paidOther :
    filter === "PENDING"        ? pending :
    filter === "OVERDUE"        ? overdue :
                                  cns;

  const filtered = sortInvoices(baseFiltered);

  // Bonus metrics
  const quarterLabel = getQuarterLabel(month);
  const unitsQ = period.units_liquidable_quarter;
  const unitsYear = period.units_liquidable_year;
  const unitsMonth = period.units_liquidable;
  const tierPct = period.applied_tier_percentage ?? 0;

  const nextTierQ = getNextTier(unitsQ, null, commissionRules);
  const nextTierYear = getNextTier(unitsYear, null, commissionRules);

  const pctQ = nextTierQ ? Math.min(100, Math.round((unitsQ / nextTierQ.threshold) * 100)) : 100;
  const pctYear = nextTierYear ? Math.min(100, Math.round((unitsYear / nextTierYear.threshold) * 100)) : 100;

  const missingQ = nextTierQ ? Math.max(0, nextTierQ.threshold - unitsQ) : 0;
  const missingYear = nextTierYear ? Math.max(0, nextTierYear.threshold - unitsYear) : 0;

  return (
    <div className="space-y-4">

      {/* Panel de métricas de bono */}
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-3">
          <div className="text-sm font-semibold text-[color:var(--viho-primary)]">
            Seguimiento de Bono — {formatMonthLabel(month)}
          </div>
        </div>
        <div className="grid gap-0 divide-x divide-[color:var(--viho-border)] sm:grid-cols-2 lg:grid-cols-4">

          {/* Ud. liquidables mes */}
          <MetricCell
            label="Ud. liquidables mes"
            value={`${unitsMonth} ud.`}
            sub={tierPct > 0 ? `${tierPct}% comisión` : "Sin tier"}
            color="text-emerald-700"
          />

          {/* Trimestre */}
          <div className="px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
              Acum. {quarterLabel}
            </div>
            <div className="mt-1 text-2xl font-bold text-[color:var(--viho-primary)]">
              {unitsQ} <span className="text-sm font-normal text-[color:var(--viho-muted)]">ud.</span>
            </div>
            {nextTierQ ? (
              <>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor(pctQ)}`}
                    style={{ width: `${pctQ}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-[color:var(--viho-muted)]">
                    {missingQ > 0 ? `Faltan ${missingQ} ud. → ${nextTierQ.pct}%` : `Bono alcanzado`}
                  </span>
                  <span className="font-semibold text-[color:var(--viho-primary)]">{pctQ}%</span>
                </div>
              </>
            ) : (
              <div className="mt-1 text-xs text-emerald-600 font-semibold">Tier máximo alcanzado</div>
            )}
          </div>

          {/* Año */}
          <div className="px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
              Acum. año {month.split("-")[0]}
            </div>
            <div className="mt-1 text-2xl font-bold text-[color:var(--viho-primary)]">
              {unitsYear} <span className="text-sm font-normal text-[color:var(--viho-muted)]">ud.</span>
            </div>
            {nextTierYear ? (
              <>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor(pctYear)}`}
                    style={{ width: `${pctYear}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-[color:var(--viho-muted)]">
                    {missingYear > 0 ? `Faltan ${missingYear} ud. → ${nextTierYear.pct}%` : `Bono anual alcanzado`}
                  </span>
                  <span className="font-semibold text-[color:var(--viho-primary)]">{pctYear}%</span>
                </div>
              </>
            ) : (
              <div className="mt-1 text-xs text-emerald-600 font-semibold">Tier máximo alcanzado</div>
            )}
          </div>

          {/* Comisión provisional */}
          <MetricCell
            label="Comisión provisional mes"
            value={formatMoney(period.commission_provisional)}
            sub={`Base: ${formatMoney(period.net_commissionable)}`}
            color="text-violet-700"
          />
        </div>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2">
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
          Todas ({invoices.length})
        </FilterBtn>
        {overdue.length > 0 && (
          <FilterBtn active={filter === "OVERDUE"} onClick={() => setFilter("OVERDUE")} tone="red">
            ⚠ Vencidas ({overdue.length})
          </FilterBtn>
        )}
        <FilterBtn active={filter === "PENDING"} onClick={() => setFilter("PENDING")} tone="amber">
          Pendientes ({pending.length})
        </FilterBtn>
        <FilterBtn active={filter === "PAID_IN_PERIOD"} onClick={() => setFilter("PAID_IN_PERIOD")} tone="green">
          ✓ Cobradas en periodo ({paidInPeriod.length})
        </FilterBtn>
        <FilterBtn active={filter === "PAID_OTHER"} onClick={() => setFilter("PAID_OTHER")} tone="teal">
          Cobradas otros periodos ({paidOther.length})
        </FilterBtn>
        {cns.length > 0 && (
          <FilterBtn active={filter === "CREDIT_NOTE"} onClick={() => setFilter("CREDIT_NOTE")} tone="purple">
            Abonos/CN ({cns.length})
          </FilterBtn>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="text-base font-semibold text-[color:var(--viho-primary)]">
              Facturas — {formatMonthLabel(month)}
            </div>
            {filter === "PAID_IN_PERIOD" && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Cuentan para comisión
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
            {filtered.length} facturas — ordenadas: vencidas primero, luego pendientes, cobradas
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-sm text-[color:var(--viho-muted)]">
            No hay facturas para el filtro seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)]">
                  <Th>Fecha emisión</Th>
                  <Th>Nº Factura</Th>
                  <Th>Cliente</Th>
                  <Th align="right">Ud. venta</Th>
                  <Th align="right">Ud. promo</Th>
                  <Th align="right">Base neta</Th>
                  <Th align="right">IVA</Th>
                  <Th align="right">R.E.</Th>
                  <Th align="right">Total</Th>
                  <Th>Vencimiento</Th>
                  <Th>Fecha cobro</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--viho-border)]">
                {filtered.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} viewedMonth={month} />
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)]">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-[color:var(--viho-muted)]">
                    TOTALES ({filtered.length} documentos)
                  </td>
                  <Td align="right" bold>{filtered.reduce((s, i) => s + i.units_sold, 0)}</Td>
                  <Td align="right" bold>{filtered.reduce((s, i) => s + i.units_foc, 0)}</Td>
                  <Td align="right" bold>{formatMoney(filtered.reduce((s, i) => s + i.total_net, 0))}</Td>
                  <Td align="right" bold>{formatMoney(filtered.reduce((s, i) => s + i.total_vat, 0))}</Td>
                  <Td align="right" bold>{formatMoney(filtered.reduce((s, i) => s + i.total_re, 0))}</Td>
                  <Td align="right" bold>{formatMoney(filtered.reduce((s, i) => s + i.total_gross, 0))}</Td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-[color:var(--viho-muted)]">
        * Datos en tiempo real de Holded. Vencimiento, estado de cobro y recargo de equivalencia (R.E.) obtenidos directamente de la factura en Holded.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InvoiceRow
// ---------------------------------------------------------------------------

function InvoiceRow({ invoice: inv, viewedMonth }: { invoice: DetailInvoiceRow; viewedMonth: string }) {
  const badge = paymentStatusBadge(inv.payment_status);
  const isCn = inv.document_type === "creditnote";
  void viewedMonth;

  const paidInDifferentMonth =
    inv.payment_status === "PAID" && !inv.paid_in_period && inv.paid_date
      ? inv.paid_date.slice(0, 7)
      : null;

  // Fecha de vencimiento real de Holded (ya resuelta en el API con fallback a invoice_date)
  const dueDateStr = inv.due_date ? new Date(inv.due_date).toLocaleDateString("es-ES") : "—";
  const dueDateObj = inv.due_date ? new Date(inv.due_date) : null;
  const daysLeftToDue = dueDateObj
    ? Math.ceil((dueDateObj.getTime() - Date.now()) / 86_400_000)
    : null;

  const rowClass = isCn
    ? "bg-purple-50/40"
    : inv.payment_status === "OVERDUE"
      ? "bg-red-50/50"
      : inv.payment_status === "PENDING" && daysLeftToDue !== null && daysLeftToDue <= 7
        ? "bg-orange-50/40"
        : inv.paid_in_period
          ? "bg-emerald-50/30"
          : inv.payment_status === "PAID"
            ? "bg-neutral-50/60"
            : "";

  return (
    <tr className={rowClass}>
      <Td>{formatDate(inv.invoice_date)}</Td>
      <Td>
        <span className={`font-mono text-xs font-semibold ${isCn ? "text-purple-700" : "text-[color:var(--viho-primary)]"}`}>
          {inv.invoice_number || "—"}
        </span>
      </Td>
      <Td>
        <span className="max-w-[170px] truncate block text-[color:var(--viho-primary)]">
          {inv.client_name || "—"}
        </span>
      </Td>
      <Td align="right">
        {isCn
          ? <span className="text-purple-700 font-semibold">-{inv.units_sold}</span>
          : inv.units_sold}
      </Td>
      <Td align="right">
        {inv.units_foc > 0 ? (
          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {isCn ? `-${inv.units_foc}` : inv.units_foc}
          </span>
        ) : "0"}
      </Td>
      <Td align="right">{formatMoney(inv.total_net)}</Td>
      <Td align="right">{formatMoney(inv.total_vat)}</Td>
      <Td align="right">
        {inv.total_re > 0 ? (
          <span className="text-xs font-medium text-amber-700">{formatMoney(inv.total_re)}</span>
        ) : (
          <span className="text-xs text-[color:var(--viho-muted)]">—</span>
        )}
      </Td>
      <Td align="right" bold>{formatMoney(inv.total_gross)}</Td>
      <Td>
        {isCn ? (
          <span className="text-xs text-purple-500">N/A</span>
        ) : inv.payment_status === "OVERDUE" ? (
          <span className="text-xs font-semibold text-red-600">
            {dueDateStr}
            {inv.days_overdue != null && inv.days_overdue > 0 && (
              <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px]">
                +{inv.days_overdue}d
              </span>
            )}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--viho-muted)]">
            {dueDateStr}
            {daysLeftToDue !== null && daysLeftToDue > 0 && daysLeftToDue <= 7 && (
              <span className="ml-1 font-semibold text-orange-500">({daysLeftToDue}d)</span>
            )}
          </span>
        )}
      </Td>
      <Td>
        <span className="text-xs text-[color:var(--viho-muted)]">
          {inv.paid_date ? formatDate(inv.paid_date) : "—"}
        </span>
      </Td>
      <Td>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className={["inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", badge.classes].join(" ")}>
              {badge.label}
            </span>
            {inv.paid_in_period && (
              <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                en periodo
              </span>
            )}
          </div>
          {paidInDifferentMonth && (
            <span className="text-[10px] text-teal-600 font-medium">
              cobrada {paidInDifferentMonth}
            </span>
          )}
        </div>
      </Td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function MetricCell({
  label,
  value,
  sub,
  color = "text-[color:var(--viho-primary)]",
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-[color:var(--viho-muted)]">{sub}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={["px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--viho-muted)]", align === "right" ? "text-right" : ""].join(" ")}>
      {children}
    </th>
  );
}

function Td({ children, align, bold }: { children: React.ReactNode; align?: "right"; bold?: boolean }) {
  return (
    <td className={["px-4 py-3 text-sm text-[color:var(--viho-primary)]", align === "right" ? "text-right" : "", bold ? "font-semibold" : ""].join(" ")}>
      {children}
    </td>
  );
}

function FilterBtn({
  children, active, onClick, tone,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: "green" | "teal" | "amber" | "red" | "purple";
}) {
  const base = "rounded-2xl border px-4 py-2 text-xs font-semibold transition";
  if (active) {
    const map: Record<string, string> = {
      green:   "border-emerald-300 bg-emerald-100 text-emerald-800",
      teal:    "border-teal-300 bg-teal-100 text-teal-800",
      amber:   "border-amber-300 bg-amber-100 text-amber-800",
      red:     "border-red-300 bg-red-100 text-red-800",
      purple:  "border-purple-300 bg-purple-100 text-purple-800",
      default: "border-[color:var(--viho-primary)] bg-[color:var(--viho-primary)] text-white",
    };
    return <button onClick={onClick} className={`${base} ${map[tone ?? "default"]}`}>{children}</button>;
  }
  return (
    <button onClick={onClick} className={`${base} border-[color:var(--viho-border)] bg-white text-[color:var(--viho-muted)] hover:text-[color:var(--viho-primary)]`}>
      {children}
    </button>
  );
}
