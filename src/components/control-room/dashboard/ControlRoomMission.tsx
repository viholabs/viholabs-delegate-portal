"use client";

import type { ReactNode } from "react";

// Alertas & Estado
import FinancialWarningsBlock from "./FinancialWarningsBlock";
import AlertCenterBlock from "./AlertCenterBlock";
import ElElyonSystemHealth from "../el-elyon/ElElyonSystemHealth";

// Sistema & Integraciones
import IntegrationsBlock from "./IntegrationsBlock";
import JobsMonitorBlock from "./JobsMonitorBlock";

// BixGrow — Crítico
import BixGrowAffiliatesBlock from "./BixGrowAffiliatesBlock";

// Facturas & Cobros — Importante
import InvoicesMonitorBlock from "./InvoicesMonitorBlock";
import CollectionRiskBlock from "./CollectionRiskBlock";

// Operación Comercial
import OrdersMonitorBlock from "./OrdersMonitorBlock";
import ClientsMonitorBlock from "./ClientsMonitorBlock";
import ActorsMonitorBlock from "./ActorsMonitorBlock";

// Performance
import ExecutiveSummaryBlock from "./ExecutiveSummaryBlock";
import KPIEngineBlock from "./KPIEngineBlock";
import PerformanceOverviewBlock from "./PerformanceOverviewBlock";

// Técnico
import HoldedLogBlock from "./HoldedLogBlock";
import TechnicalWarningsBlock from "./TechnicalWarningsBlock";
import AuditBlock from "./AuditBlock";

// Trazabilidad & Acciones
import ActivityTimelineBlock from "./ActivityTimelineBlock";
import QuickActionsBlock from "./QuickActionsBlock";

function Section({
  title,
  badge,
  children,
  fullWidth = false,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div style={sectionWrap}>
      <div style={sectionHeader}>
        <span style={sectionTitle}>{title}</span>
        {badge && <span style={sectionBadge}>{badge}</span>}
      </div>
      <div style={fullWidth ? fullWidthGrid : grid}>{children}</div>
    </div>
  );
}

export default function ControlRoomMission() {
  return (
    <div style={container}>

      {/* 1 — ALERTAS Y ESTADO */}
      <Section title="Alertas y Estado">
        <FinancialWarningsBlock />
        <AlertCenterBlock />
        <ElElyonSystemHealth />
      </Section>

      {/* 2 — SISTEMA Y OPERACIONES TÉCNICAS */}
      <Section title="Sistema y Operaciones Técnicas">
        <IntegrationsBlock />
        <JobsMonitorBlock />
      </Section>

      {/* 3 — AFILIADOS BIXGROW */}
      <Section title="Afiliados BixGrow" badge="CRÍTICO">
        <BixGrowAffiliatesBlock />
      </Section>

      {/* 4 — FACTURAS Y COBROS */}
      <Section title="Facturas y Cobros" badge="IMPORTANTE">
        <InvoicesMonitorBlock />
        <CollectionRiskBlock />
      </Section>

      {/* 5 — OPERACIÓN COMERCIAL */}
      <Section title="Operación Comercial">
        <OrdersMonitorBlock />
        <ClientsMonitorBlock />
        <ActorsMonitorBlock />
      </Section>

      {/* 6 — PERFORMANCE */}
      <Section title="Performance">
        <ExecutiveSummaryBlock />
        <KPIEngineBlock />
        <PerformanceOverviewBlock />
      </Section>

      {/* 7 — TÉCNICO */}
      <Section title="Técnico">
        <HoldedLogBlock />
        <TechnicalWarningsBlock />
        <AuditBlock />
      </Section>

      {/* 8 — ACTIVIDAD */}
      <Section title="Actividad Reciente" fullWidth>
        <ActivityTimelineBlock />
      </Section>

      {/* 9 — ACCIONES RÁPIDAS */}
      <Section title="Acciones Rápidas">
        <QuickActionsBlock />
      </Section>

    </div>
  );
}

const container: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const sectionWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingBottom: 4,
  borderBottom: "1px solid rgba(199,174,106,0.3)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  opacity: 0.75,
  color: "#7c6a3e",
};

const sectionBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  padding: "2px 7px",
  borderRadius: 999,
  background: "rgba(220,38,38,0.12)",
  color: "#b91c1c",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const fullWidthGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};
