"use client";

// src/components/control-room/delegates/detail/TabLiquidacion.tsx
// Panel de liquidación: propuesta actual del periodo y historial.

import { useState } from "react";
import { getAccessToken } from "@/lib/auth/token";
import type { SettlementProposal, DetailPeriodStats, DelegateDetailActor } from "../types";
import {
  formatMoney,
  formatMonthLabel,
  formatDatetime,
  settlementStatusLabel,
  settlementStatusTone,
} from "../utils";

type Props = {
  settlement: { current: SettlementProposal | null; history: SettlementProposal[] };
  period: DetailPeriodStats;
  month: string;
  delegate: DelegateDetailActor;
  viewer: { actorId: string; isMelquisedec: boolean; canEdit: boolean };
  onRefresh: () => void;
};

export default function TabLiquidacion({ settlement, period, month, delegate, viewer, onRefresh }: Props) {
  const { current, history } = settlement;
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const getToken = getAccessToken;

  async function openPdf() {
    setGenError(null);
    try {
      const token = await getToken();
      const url = `/api/control-room/delegates/${encodeURIComponent(delegate.id)}/settlement/pdf?month=${month}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        // Try to extract a JSON error message; fall back to HTTP status text
        let errMsg = `Error generando PDF (HTTP ${res.status})`;
        try {
          const payload = await res.json() as { error?: string } | null;
          if (payload?.error) errMsg = payload.error;
        } catch {
          // response was not JSON (e.g. Next.js HTML error page)
        }
        setGenError(errMsg);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const opened = window.open(blobUrl, "_blank");
      if (!opened) {
        setGenError("El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio e inténtalo de nuevo.");
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Error inesperado al generar PDF");
    }
  }

  async function generateSettlement() {
    setGenerating(true);
    setGenError(null);
    try {
      const token = await getToken();

      const res = await fetch(`/api/control-room/delegates/${encodeURIComponent(delegate.id)}/settlement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ month }),
      });

      const payload = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        setGenError(payload?.error ?? "Error generando propuesta");
        return;
      }

      // Open PDF first (while component is still mounted), then refresh
      await openPdf();
      onRefresh();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setGenerating(false);
    }
  }

  async function deleteDraftAndRegenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const token = await getToken();
      const baseUrl = `/api/control-room/delegates/${encodeURIComponent(delegate.id)}/settlement`;

      // Delete existing DRAFT
      const delRes = await fetch(`${baseUrl}?month=${month}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const delPayload = await delRes.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!delRes.ok || !delPayload?.ok) {
        setGenError(delPayload?.error ?? "Error eliminando propuesta existente");
        return;
      }

      // Generate new one
      const postRes = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ month }),
      });
      const postPayload = await postRes.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!postRes.ok || !postPayload?.ok) {
        setGenError(postPayload?.error ?? "Error regenerando propuesta");
        return;
      }

      // Open PDF first (while component is still mounted), then refresh
      await openPdf();
      onRefresh();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Error generando */}
      {genError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {genError}
        </div>
      )}

      {/* Propuesta del periodo actual */}
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[color:var(--viho-primary)]">
                Liquidación del periodo — {formatMonthLabel(month)}
              </div>
              <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
                Propuesta formal para {delegate.name ?? delegate.id}
              </div>
            </div>
            {viewer.isMelquisedec && !current && (
              <button
                onClick={generateSettlement}
                disabled={generating}
                className="inline-flex items-center rounded-xl border border-purple-300 bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
              >
                {generating ? "Generando…" : "Generar propuesta"}
              </button>
            )}
            {viewer.isMelquisedec && current?.status === "DRAFT" && (
              <button
                onClick={deleteDraftAndRegenerate}
                disabled={generating}
                className="inline-flex items-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {generating ? "Regenerando…" : "Regenerar propuesta"}
              </button>
            )}
          </div>
        </div>

        {current && current.status !== "DRAFT" ? (
          <SettlementCard proposal={current} onOpenPdf={openPdf} />
        ) : (
          <ProvisionalCard
            period={period}
            month={month}
            draftCreatedAt={current?.status === "DRAFT" ? current.created_at : null}
          />
        )}
      </div>

      {/* Historial de propuestas */}
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
          <div className="text-base font-semibold text-[color:var(--viho-primary)]">
            Historial de liquidaciones
          </div>
          <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
            Propuestas de periodos anteriores al seleccionado
          </div>
        </div>
        {history.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[color:var(--viho-muted)]">
            No hay liquidaciones registradas para periodos anteriores.
            {viewer.isMelquisedec && (
              <span className="block mt-1 text-xs">
                Cambia el mes en el selector superior para ver propuestas de otros periodos,
                o genera una nueva propuesta para el periodo actual.
              </span>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--viho-border)]">
            {history.map((proposal) => (
              <HistoryRow key={proposal.id} proposal={proposal} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Propuesta formal existente
// ---------------------------------------------------------------------------

function SettlementCard({ proposal, onOpenPdf }: { proposal: SettlementProposal; onOpenPdf?: () => void }) {
  const badge = settlementStatusTone(proposal.status);

  return (
    <div className="p-5 space-y-5">
      {/* Estado + botón PDF */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${badge}`}
        >
          {settlementStatusLabel(proposal.status)}
        </span>
        <span className="text-xs text-[color:var(--viho-muted)]">
          Periodo: {proposal.period_yyyy_mm}
        </span>
        {proposal.ruleset_version && (
          <span className="text-xs text-[color:var(--viho-muted)]">
            Versión reglas: {proposal.ruleset_version}
          </span>
        )}
        {onOpenPdf && (
          <button
            onClick={onOpenPdf}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-1.5 text-sm font-semibold text-[color:var(--viho-primary)] transition hover:bg-neutral-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Abrir PDF
          </button>
        )}
      </div>

      {/* Métricas principales */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell
          label="Unidades liquidables"
          value={String(proposal.total_units_sold_paid)}
          sub="Ud. cobradas"
          tone="neutral"
        />
        <MetricCell
          label="Ud. promo / FOC"
          value={String(proposal.total_units_foc)}
          sub="No comisionan"
          tone="muted"
        />
        <MetricCell
          label="Base comisionable"
          value={formatMoney(proposal.total_net_commissionable)}
          sub="Neto × 31,00 €"
          tone="green"
        />
        <MetricCell
          label="Comisión calculada"
          value={formatMoney(proposal.total_commission_amount)}
          sub="Según tier"
          tone="blue"
        />
      </div>

      {/* Ajustes y total */}
      <div className="rounded-2xl border border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)] px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs text-[color:var(--viho-muted)]">Ajustes</div>
            <div className="mt-1 text-xl font-semibold text-[color:var(--viho-primary)]">
              {formatMoney(proposal.total_adjustments_amount)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[color:var(--viho-muted)]">Total propuesto a liquidar</div>
            <div className="mt-1 text-xl font-semibold text-[color:var(--viho-primary)]">
              {formatMoney(proposal.total_payable_amount)}
            </div>
          </div>
          <div>
            {proposal.data_cutoff_at && (
              <>
                <div className="text-xs text-[color:var(--viho-muted)]">Corte de datos</div>
                <div className="mt-1 text-sm text-[color:var(--viho-primary)]">
                  {formatDatetime(proposal.data_cutoff_at)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fechas */}
      <div className="grid gap-3 sm:grid-cols-3 text-xs text-[color:var(--viho-muted)]">
        <div>Creada: {formatDatetime(proposal.created_at)}</div>
        <div>Actualizada: {formatDatetime(proposal.updated_at)}</div>
        <div>ID: <span className="font-mono">{proposal.id.slice(0, 8)}…</span></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sin propuesta formal: muestra datos provisionales calculados en tiempo real
// ---------------------------------------------------------------------------

function ProvisionalCard({
  period,
  month,
  draftCreatedAt,
}: {
  period: DetailPeriodStats;
  month: string;
  draftCreatedAt?: string | null;
}) {
  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
          {draftCreatedAt ? "Borrador desactualizado" : "Sin propuesta formal"}
        </span>
        <span className="text-xs text-[color:var(--viho-muted)]">
          Datos en tiempo real para {formatMonthLabel(month)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell
          label="Unidades liquidables"
          value={String(period.units_liquidable)}
          sub="De facturas cobradas"
          tone="neutral"
        />
        <MetricCell
          label="Ud. promo / FOC"
          value={String(period.units_foc_period)}
          sub="No comisionan"
          tone="muted"
        />
        <MetricCell
          label="Base comisionable"
          value={formatMoney(period.net_commissionable)}
          sub="Neto × 31,00 €"
          tone="green"
        />
        <MetricCell
          label="Comisión provisional"
          value={formatMoney(period.commission_provisional)}
          sub={
            period.applied_tier_percentage != null
              ? `${period.applied_tier_percentage}% s/ cobrado`
              : "Sin tier"
          }
          tone="blue"
        />
      </div>

      {draftCreatedAt && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Existe un borrador generado el {formatDatetime(draftCreatedAt)} con datos de aquel momento.
          Las cifras mostradas son las actuales (en tiempo real). Usa <strong>Regenerar propuesta</strong> para actualizar el borrador.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila del historial
// ---------------------------------------------------------------------------

function HistoryRow({ proposal }: { proposal: SettlementProposal }) {
  const badge = settlementStatusTone(proposal.status);
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="min-w-[90px] text-sm font-semibold text-[color:var(--viho-primary)]">
        {proposal.period_yyyy_mm}
      </div>
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge}`}
      >
        {settlementStatusLabel(proposal.status)}
      </span>
      <div className="flex-1 text-sm text-[color:var(--viho-muted)]">
        {formatMoney(proposal.total_payable_amount)}
      </div>
      <div className="text-xs text-[color:var(--viho-muted)]">
        {new Date(proposal.created_at).toLocaleDateString("es-ES")}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCell
// ---------------------------------------------------------------------------

function MetricCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "neutral" | "muted" | "green" | "blue";
}) {
  const styles = {
    neutral: { border: "border-[color:var(--viho-border)]", bg: "bg-[color:var(--viho-surface-2)]", text: "text-[color:var(--viho-primary)]", sub: "text-[color:var(--viho-muted)]" },
    muted: { border: "border-neutral-200", bg: "bg-neutral-50", text: "text-neutral-600", sub: "text-neutral-500" },
    green: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", sub: "text-emerald-600" },
    blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", sub: "text-blue-600" },
  }[tone];

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} px-4 py-3`}>
      <div className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${styles.sub}`}>
        {label}
      </div>
      <div className={`mt-2 text-xl font-semibold ${styles.text}`}>{value}</div>
      <div className={`mt-0.5 text-xs ${styles.sub}`}>{sub}</div>
    </div>
  );
}
