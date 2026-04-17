"use client";

// src/components/control-room/delegates/detail/DelegateHeader.tsx
// Cabecera de la ficha: back, info del delegado, KPIs superiores, month picker.

import Link from "next/link";
import type { DelegateDetailActor, DetailPeriodStats } from "../types";
import { formatMoney, formatMonthLabel, safeText, statusTone } from "../utils";

type Props = {
  delegate: DelegateDetailActor;
  period: DetailPeriodStats;
  month: string;
  onMonthChange: (month: string) => void;
  viewer: { actorId: string; isMelquisedec: boolean; canEdit: boolean };
};

export default function DelegateHeader({
  delegate,
  period,
  month,
  onMonthChange,
  viewer,
}: Props) {
  const displayName = safeText(delegate.name, delegate.email ?? delegate.id);

  return (
    <div className="space-y-0 border-b border-[color:var(--viho-border)] bg-white">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4">
        <Link
          href="/control-room/delegates"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)] px-3 py-2 text-xs font-semibold text-[color:var(--viho-muted)] transition hover:text-[color:var(--viho-primary)]"
        >
          ← Delegados
        </Link>

        {/* Month picker */}
        <div className="flex items-center gap-3">
          <label
            htmlFor="detail-month"
            className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--viho-muted)]"
          >
            Periodo
          </label>
          <input
            id="detail-month"
            type="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            className="rounded-2xl border border-[color:var(--viho-border)] bg-white px-4 py-2 text-sm text-[color:var(--viho-primary)] outline-none"
          />
        </div>
      </div>

      {/* Info del delegado */}
      <div className="px-6 pb-5">
        <div className="flex flex-wrap items-start gap-4">
          {/* Avatar / inicial */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--viho-primary)] text-xl font-bold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[color:var(--viho-primary)]">
                {displayName}
              </h1>

              <span
                className={[
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                  statusTone(delegate.status),
                ].join(" ")}
              >
                {safeText(delegate.status, "Sin estado")}
              </span>

              {viewer.isMelquisedec && (
                <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                  Melquisedec
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[color:var(--viho-muted)]">
              {delegate.email && <span>{delegate.email}</span>}
              {delegate.company && <span>{delegate.company}</span>}
              {delegate.job_title && <span>{delegate.job_title}</span>}
              {delegate.department && <span>{delegate.department}</span>}
              {delegate.commission_level != null && (
                <span>Nivel comisión: {delegate.commission_level}</span>
              )}
              <span className="text-xs opacity-60">
                Alta: {new Date(delegate.created_at).toLocaleDateString("es-ES")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs del periodo */}
      <div className="grid grid-cols-2 gap-px border-t border-[color:var(--viho-border)] bg-[color:var(--viho-border)] sm:grid-cols-4">
        <KpiCell
          label={`Clientes activos (${formatMonthLabel(month)})`}
          value={String(period.billing_emitted_count > 0 ? period.billing_emitted_count : "—")}
          sub={`${period.billing_emitted_count} fact. emitidas`}
          tone="neutral"
        />
        <KpiCell
          label="Facturado emitido"
          value={formatMoney(period.billing_emitted_gross)}
          sub={`${period.billing_emitted_count} facturas`}
          tone="neutral"
        />
        <KpiCell
          label="Liquidable (cobrado)"
          value={formatMoney(period.billing_paid_gross)}
          sub={`${period.billing_paid_count} facturas cobradas`}
          tone="green"
        />
        <KpiCell
          label="Comisión provisional"
          value={formatMoney(period.commission_provisional)}
          sub={
            period.applied_tier_percentage != null
              ? `${period.applied_tier_percentage}% sobre ${period.units_liquidable} ud. cobradas`
              : "Sin tier aplicado"
          }
          tone="blue"
        />
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "neutral" | "green" | "blue" | "red";
}) {
  const bg = {
    neutral: "bg-white",
    green: "bg-emerald-50",
    blue: "bg-blue-50",
    red: "bg-red-50",
  }[tone];

  const textMain = {
    neutral: "text-[color:var(--viho-primary)]",
    green: "text-emerald-700",
    blue: "text-blue-700",
    red: "text-red-700",
  }[tone];

  const textSub = {
    neutral: "text-[color:var(--viho-muted)]",
    green: "text-emerald-600",
    blue: "text-blue-600",
    red: "text-red-600",
  }[tone];

  return (
    <div className={`flex flex-col gap-1 px-5 py-4 ${bg}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
        {label}
      </div>
      <div className={`text-xl font-semibold ${textMain}`}>{value}</div>
      <div className={`text-xs ${textSub}`}>{sub}</div>
    </div>
  );
}
