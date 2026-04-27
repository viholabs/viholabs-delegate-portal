"use client";

import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";
import IntegrationsBlock from "@/components/control-room/dashboard/IntegrationsBlock";
import TechnicalWarningsBlock from "@/components/control-room/dashboard/TechnicalWarningsBlock";
import AuditBlock from "@/components/control-room/dashboard/AuditBlock";
import JobsMonitorBlock from "@/components/control-room/dashboard/JobsMonitorBlock";

export default function SystemModule({ kpis }: { kpis?: { critical: number; total: number } }) {
  const critical = kpis?.critical ?? 0;
  const total = kpis?.total ?? 0;
  const status: ModuleStatus = critical > 0 ? "critical" : total > 0 ? "warning" : "ok";

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
      <Subcard title="Estado de integraciones" defaultOpen>
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
