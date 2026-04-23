"use client";

import type { ReactNode } from "react";

import ExecutiveSummaryBlock from "./ExecutiveSummaryBlock";
import KPIEngineBlock from "./KPIEngineBlock";
import RevenueRadarBlock from "./RevenueRadarBlock";

import AlertCenterBlock from "./AlertCenterBlock";
import PriorityInboxBlock from "./PriorityInboxBlock";
import ElElyonSystemHealth from "../el-elyon/ElElyonSystemHealth";
import FinancialWarningsBlock from "./FinancialWarningsBlock";
import TechOpsBlock from "./TechOpsBlock";

import OrdersMonitorBlock from "./OrdersMonitorBlock";
import InvoicesMonitorBlock from "./InvoicesMonitorBlock";
import CollectionRiskBlock from "./CollectionRiskBlock";
import ClientsMonitorBlock from "./ClientsMonitorBlock";
import ActorsMonitorBlock from "./ActorsMonitorBlock";

import PerformanceOverviewBlock from "./PerformanceOverviewBlock";
import ActivityTimelineBlock from "./ActivityTimelineBlock";

import JobsMonitorBlock from "./JobsMonitorBlock";
import IntegrationsBlock from "./IntegrationsBlock";
import HoldedLogBlock from "./HoldedLogBlock";
import BixGrowLogBlock from "./BixGrowLogBlock";
import TechnicalWarningsBlock from "./TechnicalWarningsBlock";
import AuditBlock from "./AuditBlock";
import QuickActionsBlock from "./QuickActionsBlock";

function PlaceholderBlock({
  title,
  description = "Pending implementation",
}: {
  title: string;
  description?: string;
}) {
  return (
    <div style={placeholderCard}>
      <div style={placeholderEyebrow}>Mission Control</div>
      <div style={placeholderTitle}>{title}</div>
      <div style={placeholderDescription}>{description}</div>
    </div>
  );
}

function OptionalBlock({
  enabled,
  children,
  fallback,
}: {
  enabled?: boolean;
  children: ReactNode;
  fallback: ReactNode;
}) {
  return <>{enabled ? children : fallback}</>;
}

export default function ControlRoomMission() {
  return (
    <div style={container}>
      {/* PRIORITAT 0 — AVISOS FINANCERS I OPS TÈCNIQUES */}
      <div style={grid}>
        <FinancialWarningsBlock />
        <TechOpsBlock />
      </div>

      {/* NIVELL 1 — ESTAT GLOBAL */}
      <div style={grid}>
        <ExecutiveSummaryBlock />
        <KPIEngineBlock />
        <RevenueRadarBlock />
        <PriorityInboxBlock />
        <AlertCenterBlock />
        <ElElyonSystemHealth />

        <OptionalBlock
          enabled={true}
          fallback={
            <PlaceholderBlock
              title="Jobs Monitor"
              description="Cron jobs, GitHub Actions and scheduled imports."
            />
          }
        >
          <JobsMonitorBlock />
        </OptionalBlock>

        <OptionalBlock
          enabled={true}
          fallback={
            <PlaceholderBlock
              title="Integrations"
              description="Holded, Shopify, BixGrow, Supabase and external services."
            />
          }
        >
          <IntegrationsBlock />
        </OptionalBlock>
      </div>

      {/* NIVELL 2 — OPERACIÓ COMERCIAL */}
      <div style={grid}>
        <OrdersMonitorBlock />
        <InvoicesMonitorBlock />
        <CollectionRiskBlock />
        <ClientsMonitorBlock />
        <ActorsMonitorBlock />
      </div>

      {/* NIVELL 3 — PERFORMANCE I TÈCNIC */}
      <div style={grid}>
        <PerformanceOverviewBlock />

        <OptionalBlock
          enabled={true}
          fallback={
            <PlaceholderBlock
              title="Holded Log"
              description="Latest imports, duration, skipped rows and errors."
            />
          }
        >
          <HoldedLogBlock />
        </OptionalBlock>

        <OptionalBlock
          enabled={true}
          fallback={
            <PlaceholderBlock
              title="BixGrow Log"
              description="Affiliate sync status, referrals and webhook incidents."
            />
          }
        >
          <BixGrowLogBlock />
        </OptionalBlock>

        <OptionalBlock
          enabled={true}
          fallback={
            <PlaceholderBlock
              title="Technical Warnings"
              description="Stale syncs, anomalies, duplicates and unresolved mappings."
            />
          }
        >
          <TechnicalWarningsBlock />
        </OptionalBlock>

        <OptionalBlock
          enabled={true}
          fallback={
            <PlaceholderBlock
              title="Audit"
              description="Recent automated actions, triggers and execution results."
            />
          }
        >
          <AuditBlock />
        </OptionalBlock>
      </div>

      {/* NIVELL 4 — TRAÇABILITAT */}
      <div style={timeline}>
        <ActivityTimelineBlock />
      </div>

      {/* NIVELL 5 — ACCIÓ */}
      <div style={grid}>
        <OptionalBlock
          enabled={true}
          fallback={
            <PlaceholderBlock
              title="Quick Actions"
              description="Fast access to critical operational actions."
            />
          }
        >
          <QuickActionsBlock />
        </OptionalBlock>
      </div>
    </div>
  );
}

const container: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  alignItems: "stretch",
};

const timeline: React.CSSProperties = {
  width: "100%",
};

const placeholderCard: React.CSSProperties = {
  minHeight: 108,
  border: "1px solid rgba(199, 174, 106, 0.28)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251, 246, 236, 0.72)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: 8,
};

const placeholderEyebrow: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.2,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
};

const placeholderTitle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.25,
  fontWeight: 700,
};

const placeholderDescription: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  opacity: 0.78,
};