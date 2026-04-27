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

export default function SystemModule({ kpis }: { kpis?: { critical: number; total: number } }) {
  const critical = kpis?.critical ?? 0;
  const total = kpis?.total ?? 0;
  const status: ModuleStatus = critical > 0 ? "critical" : total > 0 ? "warning" : "ok";

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<HoldedSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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
