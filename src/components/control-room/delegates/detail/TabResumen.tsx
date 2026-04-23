"use client";

// src/components/control-room/delegates/detail/TabResumen.tsx
// Resumen operativo del periodo: métricas de facturación, unidades y comisiones.

import type { DetailPeriodStats, DelegateDetailActor } from "../types";
import { formatMoney, formatMonthLabel } from "../utils";

type Props = {
  period: DetailPeriodStats;
  delegate: DelegateDetailActor;
};

export default function TabResumen({ period, delegate }: Props) {
  return (
    <div className="space-y-6">
      {/* Bloque facturación */}
      <Card title="Facturación del periodo" subtitle={formatMonthLabel(period.month)}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricBox
            label="Emitidas"
            count={period.billing_emitted_count}
            amount={period.billing_emitted_gross}
            tone="neutral"
            note="Por fecha de emisión"
          />
          <MetricBox
            label="Cobradas"
            count={period.billing_paid_count}
            amount={period.billing_paid_gross}
            tone="green"
            note="Cobradas en el periodo"
          />
          <MetricBox
            label="Pendientes"
            count={period.billing_pending_count}
            amount={period.billing_pending_gross}
            tone="amber"
            note="Sin vencer"
          />
          <MetricBox
            label="Vencidas sin cobrar"
            count={period.billing_overdue_count}
            amount={period.billing_overdue_gross}
            tone="red"
            note="≈ Net30 desde emisión"
          />
        </div>
      </Card>

      {/* Bloque unidades */}
      <Card
        title="Unidades del periodo"
        subtitle="Clasificación por estado de cobro"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UnitBox
            label="Unidades vendidas"
            units={period.units_sold_period}
            description="En facturas emitidas este periodo"
            tone="neutral"
          />
          <UnitBox
            label="Unidades liquidables"
            units={period.units_liquidable}
            description="De facturas efectivamente cobradas"
            tone="green"
          />
          <UnitBox
            label="Pendientes no vencidas"
            units={period.units_pending_non_overdue}
            description="Sin cobrar, vencimiento futuro"
            tone="amber"
          />
          <UnitBox
            label="Pendientes vencidas"
            units={period.units_pending_overdue}
            description="Sin cobrar, vencidas (≈ Net30)"
            tone="red"
            warning
          />
        </div>

        {/* Promo/FOC */}
        <div className="mt-4 rounded-2xl border border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-[color:var(--viho-primary)]">
              Unidades promo / FOC: {period.units_foc_period}
            </div>
            <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">
              Visibles, no comisionan
            </span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--viho-muted)]">
            Las unidades promocionadas o FOC aparecen en el listado de facturas pero no generan
            base comisionable según la regla vigente.
          </p>
        </div>
      </Card>

      {/* Bloque comisiones provisionales */}
      <Card title="Comisión provisional" subtitle="Sobre unidades liquidables (cobradas)">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
              Base comisionable
            </div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">
              {formatMoney(period.net_commissionable)}
            </div>
            <div className="mt-1 text-xs text-emerald-600">
              {period.units_liquidable} unidades × precio referencia 31,00 €
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-700">
              Tier aplicado
            </div>
            <div className="mt-2 text-2xl font-semibold text-blue-700">
              {period.applied_tier_percentage != null
                ? `${period.applied_tier_percentage}%`
                : "—"}
            </div>
            <div className="mt-1 text-xs text-blue-600">
              Según tabla de escalado vigente
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-300 bg-emerald-100 px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800">
              Comisión liquidable
            </div>
            <div className="mt-2 text-2xl font-semibold text-emerald-800">
              {formatMoney(period.commission_liquidable)}
            </div>
            <div className="mt-1 text-xs text-emerald-700">
              Solo facturas cobradas en el periodo
            </div>
          </div>
        </div>

      </Card>

      {/* Datos del delegado */}
      <Card title="Datos del delegado">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" value={delegate.name} />
          <Field label="Email" value={delegate.email} />
          <Field label="Estado" value={delegate.status} />
          <Field label="Empresa" value={delegate.company} />
          <Field label="Cargo" value={delegate.job_title} />
          <Field label="Departamento" value={delegate.department} />
          <Field label="Nivel de comisión" value={delegate.commission_level?.toString()} />
          <Field
            label="Alta en el sistema"
            value={delegate.created_at
              ? new Date(delegate.created_at).toLocaleDateString("es-ES")
              : undefined}
          />
        </dl>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-base font-semibold text-[color:var(--viho-primary)]">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function MetricBox({
  label,
  count,
  amount,
  tone,
  note,
}: {
  label: string;
  count: number;
  amount: number;
  tone: "neutral" | "green" | "amber" | "red";
  note?: string;
}) {
  const styles = {
    neutral: {
      border: "border-[color:var(--viho-border)]",
      bg: "bg-[color:var(--viho-surface-2)]",
      text: "text-[color:var(--viho-primary)]",
      sub: "text-[color:var(--viho-muted)]",
    },
    green: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", sub: "text-emerald-600" },
    amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", sub: "text-amber-600" },
    red: { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", sub: "text-red-600" },
  }[tone];

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} px-4 py-4`}>
      <div className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${styles.sub}`}>
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${styles.text}`}>{count}</div>
      <div className={`mt-1 text-sm font-medium ${styles.text}`}>{formatMoney(amount)}</div>
      {note && <div className={`mt-1 text-xs ${styles.sub}`}>{note}</div>}
    </div>
  );
}

function UnitBox({
  label,
  units,
  description,
  tone,
  warning,
}: {
  label: string;
  units: number;
  description: string;
  tone: "neutral" | "green" | "amber" | "red";
  warning?: boolean;
}) {
  const styles = {
    neutral: { border: "border-[color:var(--viho-border)]", bg: "bg-[color:var(--viho-surface-2)]", text: "text-[color:var(--viho-primary)]", sub: "text-[color:var(--viho-muted)]" },
    green: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", sub: "text-emerald-600" },
    amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", sub: "text-amber-600" },
    red: { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", sub: "text-red-600" },
  }[tone];

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} px-4 py-4`}>
      <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] ${styles.sub}`}>
        {label}
        {warning && (
          <span className="rounded-full bg-red-100 px-1.5 text-red-700">!</span>
        )}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${styles.text}`}>{units}</div>
      <div className={`mt-1 text-xs ${styles.sub}`}>{description}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[color:var(--viho-primary)]">
        {value ?? "—"}
      </dd>
    </div>
  );
}
