"use client";

import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";
import BixGrowAffiliatesBlock from "@/components/control-room/dashboard/BixGrowAffiliatesBlock";

export default function BixGrowModule({ kpis }: {
  kpis?: { total: number; active: number; client_links: number };
}) {
  const total = kpis?.total ?? 0;
  const active = kpis?.active ?? 0;
  const links = kpis?.client_links ?? 0;

  const status: ModuleStatus = total === 0 ? "empty" : active < total ? "warning" : "ok";

  return (
    <ElElyonModuleCard
      icon="🔗"
      title="BixGrow / Afiliación"
      subtitle="Afiliados externos · Atribución comercial · Comisiones · Provisión automática"
      status={status}
      kpis={
        <>
          <KpiChip label="Afiliados" value={total} />
          <KpiChip label="Activos" value={active} />
          <KpiChip label="Clientes vinculados" value={links} />
          <KpiChip label="Sin vincular" value={total - links > 0 ? total - links : 0} warn={total - links > 0} />
        </>
      }
      defaultOpen
    >
      <Subcard title="Gestión completa de afiliados" defaultOpen>
        <BixGrowAffiliatesBlock />
      </Subcard>

      <Subcard title="Diferencias conceptuales">
        <div style={{ fontSize: 12, opacity: 0.7, display: "flex", flexDirection: "column", gap: 4 }}>
          <div><strong>Afiliado BixGrow</strong>: canal externo, normalmente ligado a Shopify o código de afiliado.</div>
          <div><strong>Recomendador</strong>: cliente interno que recomienda otros clientes. Comisión deducida del delegado.</div>
          <div><strong>Comisionista</strong>: actor nacional o internacional con estructura de hasta 5 niveles.</div>
          <div><strong>Delegado</strong>: actor comercial principal. Gestiona cartera de clientes.</div>
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
