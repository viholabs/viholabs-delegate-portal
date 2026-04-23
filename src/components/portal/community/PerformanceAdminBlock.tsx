"use client";

import * as React from "react";
import { useCommunityProfile } from "./useCommunityProfile";
import { getAccessToken } from "@/lib/auth/token";
import type { DetailPeriodStats, CommissionRule } from "@/components/control-room/delegates/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

function formatMonthLabel(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
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
  const next = pdv.find((r) => r.from_units > units);
  if (!next) return null;
  return { threshold: next.from_units, pct: next.percentage };
}

// ---------------------------------------------------------------------------
// Shared card shells
// ---------------------------------------------------------------------------

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-[#E8DCC5] bg-[#FFFDF8] p-4 shadow-sm">
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-[#EADDB7] pb-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
        {title}
      </div>
      {subtitle && (
        <div className="mt-1 text-sm text-[#8B7355]">{subtitle}</div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-[#5A4B38]">{label}</span>
      <span className="text-sm font-semibold text-[#2E261D]">{value}</span>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 100 ? "#27AE60" : clamped >= 70 ? "#C7822A" : "#7C5CE4";
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#EDE3CE]">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped}%`, background: color }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <CardShell>
      <CardHeader title="Performance" />
      <div className="mt-3 text-sm text-[#6E5B43]">Cargando…</div>
    </CardShell>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[28px] border border-[#E7C1C1] bg-[#FFF7F7] p-4 shadow-sm">
      <CardHeader title="Performance" />
      <div className="mt-3 text-sm text-[#8A3B3B]">{message}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delegate performance card
// ---------------------------------------------------------------------------

type DelegateData = {
  period: DetailPeriodStats;
  commission_rules: CommissionRule[];
  delegate: { id: string };
};

function DelegatePerformanceCard({ data, month }: { data: DelegateData; month: string }) {
  const { period, commission_rules, delegate } = data;
  const yearUnits = period.units_liquidable_year ?? 0;
  const qtrUnits = period.units_liquidable_quarter ?? 0;
  const currentPct = period.applied_tier_percentage;
  const next = getNextTier(yearUnits, delegate.id, commission_rules);
  const progressPct = next ? Math.round((yearUnits / next.threshold) * 100) : 100;
  const missing = next ? Math.max(0, next.threshold - yearUnits) : 0;

  return (
    <CardShell>
      <CardHeader title="Performance" subtitle={formatMonthLabel(month)} />

      <div className="mt-3 space-y-3">
        {/* Tier actual */}
        <div className="rounded-[18px] border border-[#E8DCC5] bg-white/70 p-3 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
            Comisión PDV
          </div>
          <Row label="Nivel actual" value={formatPct(currentPct)} />
          <Row label="Comisión est. mes" value={formatCurrency(period.commission_provisional)} />
          <Row label="Base comisionable" value={formatCurrency(period.net_commissionable)} />
        </div>

        {/* Progreso anual */}
        <div className="rounded-[18px] border border-[#E8DCC5] bg-white/70 p-3 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
            Unidades acumuladas
          </div>
          <Row label="Este mes" value={formatNumber(period.units_liquidable)} />
          <Row label="Este trimestre" value={formatNumber(qtrUnits)} />
          <Row label="Este año" value={formatNumber(yearUnits)} />

          {next && (
            <div className="pt-1">
              <div className="flex items-center justify-between text-[11px] text-[#8B7355]">
                <span>Siguiente nivel ({formatPct(next.pct)})</span>
                <span>{progressPct}%</span>
              </div>
              <ProgressBar pct={progressPct} />
              <div className="mt-1.5 text-[11px] text-[#8B7355]">
                Faltan {formatNumber(missing)} uds para {formatPct(next.pct)}
              </div>
            </div>
          )}

          {!next && currentPct != null && (
            <div className="mt-1 text-[11px] font-medium text-[#27AE60]">
              Nivel máximo alcanzado ({formatPct(currentPct)})
            </div>
          )}
        </div>
      </div>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function PerformanceAdminBlock() {
  const { profile, loading: profileLoading } = useCommunityProfile();
  const [delegateData, setDelegateData] = React.useState<DelegateData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const month = React.useMemo(isoMonth, []);
  const role = String(profile.role ?? "").toLowerCase();
  const actorId = profile.actor_id ?? profile.effective_actor_id;
  const isDelegate = role === "delegate" && !!actorId;

  React.useEffect(() => {
    if (profileLoading || !isDelegate) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `/api/control-room/delegates/${encodeURIComponent(actorId!)}?month=${month}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }
        );
        const j = await res.json().catch(() => null);
        if (!j?.ok) throw new Error(j?.error ?? "Error al cargar datos");
        if (!cancelled) {
          setDelegateData({
            period: j.period,
            commission_rules: j.commission_rules ?? [],
            delegate: j.delegate,
          });
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [profileLoading, isDelegate, actorId, month]);

  if (profileLoading || (isDelegate && loading)) return <LoadingState />;
  if (isDelegate && error) return <ErrorState message={error} />;
  if (isDelegate && delegateData) {
    return <DelegatePerformanceCard data={delegateData} month={month} />;
  }

  // Non-delegate fallback: show a clean informational card
  return (
    <CardShell>
      <CardHeader title="Performance" />
      <div className="mt-3 rounded-[18px] border border-[#E8DCC5] bg-white/70 p-3">
        <div className="text-sm text-[#6E5B43]">
          Métricas de rendimiento disponibles para delegados.
        </div>
      </div>
    </CardShell>
  );
}
