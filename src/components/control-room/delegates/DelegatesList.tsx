"use client";

// src/components/control-room/delegates/DelegatesList.tsx
// Listado de delegados con métricas motivacionales de comisiones y bono.

import Link from "next/link";
import type { DelegateListRow } from "./types";
import { formatMoney, formatMonthLabel, safeText, statusTone } from "./utils";

type Props = {
  delegates: DelegateListRow[];
  loading: boolean;
  error: string | null;
  month: string;
};

export default function DelegatesList({ delegates, loading, error }: Props) {
  if (loading) {
    return (
      <div className="px-6 py-8 text-sm text-[color:var(--viho-muted)]">
        Cargando delegados…
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          Error al cargar delegados: {error}
        </div>
      </div>
    );
  }

  if (!loading && !error && delegates.length === 0) {
    return (
      <div className="px-6 py-8 text-sm text-[color:var(--viho-muted)]">
        No hay delegados visibles para este periodo.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[color:var(--viho-border)]">
      {delegates.map((d) => {
        const p = d.period;
        const tierPct = p.applied_tier_pct !== null ? `${p.applied_tier_pct}%` : "—";
        const hasDormant = d.clients_dormant > 0;

        // Bono progress: current units toward the next tier threshold
        const hasBono = p.next_tier_threshold !== null && p.next_tier_threshold > 0;
        const progressPct = hasBono
          ? Math.min(100, Math.round(((p.units_approx) / p.next_tier_threshold!) * 100))
          : p.applied_tier_pct !== null ? 100 : 0;
        const unitsToNext = hasBono ? Math.max(0, p.next_tier_threshold! - p.units_approx) : 0;

        return (
          <div
            key={d.id}
            className="grid items-start gap-3 px-6 py-5 xl:grid-cols-[minmax(220px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(210px,1fr)_auto]"
          >
            {/* ── 1. Info del delegado ── */}
            <div className="min-w-0 self-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-[color:var(--viho-primary)]">
                  {safeText(d.name, d.email ?? d.id)}
                </span>
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                    statusTone(d.status),
                  ].join(" ")}
                >
                  {safeText(d.status, "Sin estado")}
                </span>
              </div>
              <div className="mt-1 text-sm text-[color:var(--viho-muted)]">
                {safeText(d.email)}
              </div>
              {/* Clientes: total → activos (30d) + dormidos */}
              <div className="mt-2.5 space-y-0.5 text-sm">
                <div className="text-[color:var(--viho-muted)]">
                  Clientes:{" "}
                  <span className="font-semibold text-[color:var(--viho-primary)]">
                    {d.clients_total}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4">
                  <span className="text-emerald-700">
                    Activos (30d):{" "}
                    <span className="font-semibold">{d.clients_active}</span>
                  </span>
                  <span className={hasDormant ? "text-amber-600" : "text-[color:var(--viho-muted)]"}>
                    Dormidos:{" "}
                    <span className={["font-semibold", hasDormant ? "text-amber-700" : ""].join(" ")}>
                      {d.clients_dormant}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* ── 2. Comisión provisional ── */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">
                Comisión provisional
              </div>
              <div className="mt-2 text-2xl font-semibold text-blue-800">
                {formatMoney(p.commission_provisional)}
              </div>
              <div className="mt-1 text-sm text-blue-600">
                {p.units_approx} u. cobradas · tier {tierPct}
              </div>
              <div className="mt-2 border-t border-blue-200 pt-2 text-sm text-blue-700">
                <span className="text-[color:var(--viho-muted)] text-xs">Liquidables:</span>{" "}
                <span className="font-semibold text-emerald-700">{p.liquidable_count}</span>
                <span className="mx-2 text-blue-300">·</span>
                <span className="text-[color:var(--viho-muted)] text-xs">Emitidas:</span>{" "}
                <span className="font-semibold text-[color:var(--viho-primary)]">{p.emitted_count}</span>
              </div>
            </div>

            {/* ── 3. Progreso bono ── */}
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-600">
                Progreso bono
              </div>
              {hasBono ? (
                <>
                  <div className="mt-2 text-xl font-semibold text-violet-800">
                    {progressPct}%
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-violet-200">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-sm text-violet-700">
                    Faltan{" "}
                    <span className="font-semibold">{unitsToNext} u.</span>{" "}
                    para tier{" "}
                    <span className="font-semibold">{p.next_tier_pct}%</span>
                  </div>
                </>
              ) : p.applied_tier_pct !== null ? (
                <>
                  <div className="mt-2 text-base font-semibold text-violet-800">
                    Tier máximo
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-violet-200">
                    <div className="h-full w-full rounded-full bg-violet-500" />
                  </div>
                  <div className="mt-1.5 text-sm text-violet-700">
                    {tierPct} · máximo alcanzado
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-violet-500">
                  Sin tabla de comisiones
                </div>
              )}
            </div>

            {/* ── 4. Estado facturas ── */}
            <div className="rounded-2xl border border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--viho-muted)]">
                Estado facturas
              </div>
              <div className="mt-2 space-y-2">
                {/* Pendientes */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className={["text-sm font-medium", p.pending_count > 0 ? "text-amber-700" : "text-[color:var(--viho-muted)]"].join(" ")}>
                    Pendientes
                  </span>
                  <span className={["text-right text-sm font-semibold tabular-nums", p.pending_count > 0 ? "text-amber-700" : "text-[color:var(--viho-muted)]"].join(" ")}>
                    {p.pending_count > 0 ? (
                      <>{p.pending_count} · {formatMoney(p.pending_total_gross)}</>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                {/* Vencidas */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className={["text-sm font-medium", p.overdue_count > 0 ? "text-red-700" : "text-[color:var(--viho-muted)]"].join(" ")}>
                    Vencidas
                  </span>
                  <span className={["text-right text-sm font-semibold tabular-nums", p.overdue_count > 0 ? "text-red-700" : "text-[color:var(--viho-muted)]"].join(" ")}>
                    {p.overdue_count > 0 ? (
                      <>{p.overdue_count} · {formatMoney(p.overdue_total_gross)}</>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* ── 5. Abrir ── */}
            <div className="flex items-center xl:justify-end">
              <Link
                href={`/control-room/delegates/${encodeURIComponent(d.id)}`}
                className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--viho-border)] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--viho-primary)] transition hover:bg-[color:var(--viho-surface-2)]"
              >
                Abrir
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI strip global del listado
// ---------------------------------------------------------------------------

type KpiTotals = {
  delegates: number;
  clients: number;
  commissionTotal: number;
  liquidableCount: number;
  liquidableGross: number;
  pendingCount: number;
  pendingGross: number;
  overdueCount: number;
  overdueGross: number;
};

export function DelegatesKpiStrip({
  totals,
  month,
}: {
  totals: KpiTotals;
  month: string;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <div className="rounded-3xl border border-[color:var(--viho-border)] bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--viho-muted)]">
          Delegados
        </div>
        <div className="mt-2 text-3xl font-semibold text-[color:var(--viho-primary)]">
          {totals.delegates}
        </div>
        <div className="mt-2 text-sm text-[color:var(--viho-muted)]">
          Visibles en {formatMonthLabel(month)}
        </div>
      </div>

      <div className="rounded-3xl border border-[color:var(--viho-border)] bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--viho-muted)]">
          Clientes activos
        </div>
        <div className="mt-2 text-3xl font-semibold text-[color:var(--viho-primary)]">
          {totals.clients}
        </div>
        <div className="mt-2 text-sm text-[color:var(--viho-muted)]">
          Asignaciones abiertas
        </div>
      </div>

      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
          Comisiones estimadas
        </div>
        <div className="mt-2 text-3xl font-semibold text-blue-700">
          {formatMoney(totals.commissionTotal)}
        </div>
        <div className="mt-2 text-sm text-blue-600">Total provisional</div>
      </div>

      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
          Liquidables
        </div>
        <div className="mt-2 text-3xl font-semibold text-emerald-700">
          {totals.liquidableCount}
        </div>
        <div className="mt-2 text-sm text-emerald-700">
          {formatMoney(totals.liquidableGross)}
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
          Pendientes
        </div>
        <div className="mt-2 text-3xl font-semibold text-amber-700">
          {totals.pendingCount}
        </div>
        <div className="mt-2 text-sm text-amber-700">
          {formatMoney(totals.pendingGross)}
        </div>
      </div>

      <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
          Vencidas
        </div>
        <div className="mt-2 text-3xl font-semibold text-red-700">
          {totals.overdueCount}
        </div>
        <div className="mt-2 text-sm text-red-700">
          {formatMoney(totals.overdueGross)}
        </div>
      </div>
    </section>
  );
}
