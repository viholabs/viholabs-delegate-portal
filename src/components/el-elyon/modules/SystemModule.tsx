"use client";

import { useState } from "react";
import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";
import IntegrationsBlock from "@/components/control-room/dashboard/IntegrationsBlock";
import TechnicalWarningsBlock from "@/components/control-room/dashboard/TechnicalWarningsBlock";
import AuditBlock from "@/components/control-room/dashboard/AuditBlock";
import JobsMonitorBlock from "@/components/control-room/dashboard/JobsMonitorBlock";

type HoldedSyncResult = {
  total_holded: number;
  synced: number;
  errors: number;
  shopify_matched: number;
};

type ReconcileResult = {
  checked: number;
  settled: number;
  errors: number;
  remaining_open: number;
  details: { invoice_number: string; action: string; paid_date: string | null }[];
  open_diagnostics?: {
    invoice_number: string;
    holded_status: string | null;
    payments_total: number | null;
    payments_pending: number | null;
    holded_total: number | null;
    our_total_gross: number;
  }[];
};

export default function SystemModule({ kpis }: { kpis?: { critical: number; total: number } }) {
  const critical = kpis?.critical ?? 0;
  const total = kpis?.total ?? 0;
  const status: ModuleStatus = critical > 0 ? "critical" : total > 0 ? "warning" : "ok";

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<HoldedSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  async function syncHolded() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const r = await fetch("/api/el-elyon/holded/sync-contacts", { method: "POST" });
      const text = await r.text();
      let d: any;
      try { d = JSON.parse(text); } catch {
        setSyncError(`HTTP ${r.status}: ${text.slice(0, 200)}`);
        return;
      }
      if (d.ok) setSyncResult(d);
      else setSyncError(d.error ?? "Error desconocido");
    } catch (e: unknown) {
      setSyncError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function reconcileOpen() {
    setReconciling(true);
    setReconcileResult(null);
    setReconcileError(null);
    try {
      const r = await fetch("/api/holded/invoices/reconcile-open", { method: "POST" });
      const text = await r.text();
      let d: any;
      try { d = JSON.parse(text); } catch {
        setReconcileError(`HTTP ${r.status}: ${text.slice(0, 200)}`);
        return;
      }
      if (d.ok) setReconcileResult(d);
      else setReconcileError(d.error ?? "Error desconocido");
    } catch (e: unknown) {
      setReconcileError(String(e));
    } finally {
      setReconciling(false);
    }
  }

  return (
    <ElElyonModuleCard
      icon="🛡️"
      title="System Integrity"
      subtitle="Integraciones · Jobs · Warnings · Audit trail"
      status={status}
      kpis={
        <>
          <KpiChip label="Warnings críticos" value={critical} warn={critical > 0} />
          <KpiChip label="Warnings totales" value={total} warn={total > 0} />
        </>
      }
    >
      {/* Holded contacts sync */}
      <Subcard title="Sincronización Holded → Clientes" defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Holded es la fuente de verdad. Este sync replica <strong>todos los contactos de Holded</strong> en
            la tabla de clientes de Viholabs (nombre, email, teléfono, NIF, dirección fiscal, etc.)
            y automáticamente vincula los pedidos Shopify sin match.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={syncHolded}
              disabled={syncing}
              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(90,46,58,0.3)", background: "rgba(90,46,58,0.08)", color: "#5a2e3a", fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.6 : 1 }}
            >
              {syncing ? "Sincronizando Holded…" : "↻ Sync Holded → Clientes"}
            </button>
            {syncResult && (
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(6,95,70,0.1)", color: "#065f46", fontWeight: 600 }}>
                ✓ {syncResult.total_holded} contactos Holded · {syncResult.synced} sincronizados
                {syncResult.shopify_matched > 0 && ` · ${syncResult.shopify_matched} pedidos Shopify vinculados`}
                {syncResult.errors > 0 && ` · ${syncResult.errors} errores`}
              </span>
            )}
            {syncError && (
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(185,28,28,0.1)", color: "#b91c1c", fontWeight: 600 }}>
                ✗ {syncError}
              </span>
            )}
          </div>
          {syncResult && (
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              Tras el sync, recarga el módulo Shopify para ver los pedidos vinculados.
            </div>
          )}
        </div>
      </Subcard>

      {/* Invoice reconciliation — fixes CN-settled invoices showing as Vencida */}
      <Subcard title="Reconciliación facturas Holded" defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#4b4b4b" }}>
            Re-verifica en Holded todas las facturas <strong>OPEN</strong> de la BD. Detecta las saldadas
            via abono (CN) que el sync incremental no actualiza porque Holded no las marca como
            "modificadas" al crear la CN. Usar tras cada importación o cuando haya incongruencias
            con el estado real de Holded.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={reconcileOpen}
              disabled={reconciling}
              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(146,64,14,0.35)", background: "rgba(146,64,14,0.07)", color: "#92400e", fontWeight: 700, cursor: reconciling ? "not-allowed" : "pointer", opacity: reconciling ? 0.6 : 1 }}
            >
              {reconciling ? "Reconciliando…" : "⚡ Reconciliar facturas abiertas"}
            </button>
            {reconcileResult && (
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(6,95,70,0.1)", color: "#065f46", fontWeight: 600 }}>
                ✓ {reconcileResult.checked} revisadas · {reconcileResult.settled} saldadas
                {reconcileResult.remaining_open > 0 && ` · ${reconcileResult.remaining_open} siguen abiertas`}
                {reconcileResult.errors > 0 && ` · ${reconcileResult.errors} errores`}
              </span>
            )}
            {reconcileError && (
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(185,28,28,0.1)", color: "#b91c1c", fontWeight: 600 }}>
                ✗ {reconcileError}
              </span>
            )}
          </div>
          {reconcileResult && reconcileResult.settled > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {reconcileResult.details.map((d, i) => (
                <div key={i} style={{ fontSize: 11, color: "#374151" }}>
                  <strong>{d.invoice_number}</strong> → {d.action}
                  {d.paid_date ? ` · ${d.paid_date}` : " · sin fecha (revisar manualmente)"}
                </div>
              ))}
            </div>
          )}
          {reconcileResult && reconcileResult.open_diagnostics && reconcileResult.open_diagnostics.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
                Diagnóstico Holded — facturas que siguen abiertas según la API:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {reconcileResult.open_diagnostics.map((d, i) => (
                  <div key={i} style={{ fontSize: 10, fontFamily: "monospace", background: "rgba(0,0,0,0.04)", borderRadius: 4, padding: "2px 6px", color: "#374151" }}>
                    <strong>{d.invoice_number}</strong> status=<em>{d.holded_status ?? "–"}</em>
                    {" "} pending={d.payments_pending ?? "–"} total={d.payments_total ?? "–"} holded_total={d.holded_total ?? "–"} nuestro={d.our_total_gross}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Subcard>

      <Subcard title="Estado de integraciones">
        <IntegrationsBlock />
      </Subcard>

      <Subcard title="Jobs y pipelines">
        <JobsMonitorBlock />
      </Subcard>

      <Subcard title="Warnings técnicos">
        <TechnicalWarningsBlock />
      </Subcard>

      <Subcard title="Audit trail">
        <AuditBlock />
      </Subcard>
    </ElElyonModuleCard>
  );
}
