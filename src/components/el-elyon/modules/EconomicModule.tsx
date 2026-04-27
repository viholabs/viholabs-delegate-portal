"use client";

import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";
import CollectionRiskBlock from "@/components/control-room/dashboard/CollectionRiskBlock";
import InvoicesMonitorBlock from "@/components/control-room/dashboard/InvoicesMonitorBlock";

function fmt(n: number) { return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function EconomicModule({ kpis }: {
  kpis?: { total_invoiced: number; total_paid: number; total_unpaid: number; overdue: number };
}) {
  const invoiced = kpis?.total_invoiced ?? 0;
  const paid = kpis?.total_paid ?? 0;
  const unpaid = kpis?.total_unpaid ?? 0;
  const overdue = kpis?.overdue ?? 0;

  const status: ModuleStatus = overdue > 5 ? "critical" : overdue > 0 || unpaid > 0 ? "warning" : "ok";

  return (
    <ElElyonModuleCard
      icon="📊"
      title="Economic Control"
      subtitle="Ingresos · Exposición comisiones · Riesgo cobro · Ajustes CN"
      status={status}
      kpis={
        <>
          <KpiChip label="Facturado" value={`${fmt(invoiced)} €`} />
          <KpiChip label="Cobrado" value={`${fmt(paid)} €`} />
          <KpiChip label="Pendiente" value={`${fmt(unpaid)} €`} warn={unpaid > 0} />
          <KpiChip label="Vencidas" value={overdue} warn={overdue > 0} />
        </>
      }
    >
      <Subcard title="Monitor de facturas" defaultOpen>
        <InvoicesMonitorBlock />
      </Subcard>

      <Subcard title="Riesgo de cobro">
        <CollectionRiskBlock />
      </Subcard>

      <Subcard title="Reglas canónicas">
        <div style={{ fontSize: 12, opacity: 0.7, display: "flex", flexDirection: "column", gap: 3 }}>
          <div>· Solo facturas cobradas generan comisión (is_paid canónico, no recalcular en frontend).</div>
          <div>· Solo unidades tipo <strong>sale</strong> entran en base liquidable.</div>
          <div>· CN/abonos nunca generan comisión y restan unidades e importes.</div>
          <div>· Promos no generan comisión.</div>
          <div>· La fecha de cobro viene de Holded.</div>
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
