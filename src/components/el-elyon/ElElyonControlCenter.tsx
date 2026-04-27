"use client";

import { useEffect, useState } from "react";
import { StatusDot, StatusBadge, KpiChip, type ModuleStatus } from "./ElElyonModuleCard";
import GovernanceModule from "./modules/GovernanceModule";
import ActorsModule from "./modules/ActorsModule";
import RecommendersModule from "./modules/RecommendersModule";
import CommissionAgentsModule from "./modules/CommissionAgentsModule";
import ShopifyModule from "./modules/ShopifyModule";
import BixGrowModule from "./modules/BixGrowModule";
import LiquidationsModule from "./modules/LiquidationsModule";
import EconomicModule from "./modules/EconomicModule";
import SystemModule from "./modules/SystemModule";

type OverviewKpis = {
  actors: { total: number; active: number; with_roles: number; without_role: number };
  recommenders: { total: number; active: number; client_links: number };
  commission_agents: { total: number; active: number };
  affiliates: { total: number; active: number };
  invoices: { total: number; total_invoiced: number; total_paid: number; total_unpaid: number; overdue: number };
  shopify: { configured: boolean; order_count: number };
  warnings: { critical: number; total: number };
  liquidations: { pending: number; total: number };
};

function fmt(n: number, dec = 2) { return n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

export default function ElElyonControlCenter() {
  const [kpis, setKpis] = useState<OverviewKpis | null>(null);
  const [globalStatus, setGlobalStatus] = useState<ModuleStatus>("loading");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/el-elyon/overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setKpis(d.kpis);
          setGlobalStatus(d.global_status as ModuleStatus);
        }
      })
      .catch(() => setGlobalStatus("warning"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 0 24px" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ padding: "16px 20px", background: "rgba(90,46,58,0.06)", borderRadius: 16, border: "1px solid rgba(90,46,58,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.6 }}>Viholabs · Sistema Soberano</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#5a2e3a", marginTop: 2 }}>El-Elyon Control Center</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>Actores · Roles · Recomendadores · Comisionistas · BixGrow · Shopify · Liquidaciones · Integridad</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <StatusDot status={globalStatus} />
            <StatusBadge status={globalStatus} label={globalStatus === "ok" ? "Sistema OK" : globalStatus === "critical" ? "Atención crítica" : globalStatus === "warning" ? "Avisos activos" : "Cargando"} />
          </div>
        </div>

        {/* KPI strip */}
        {kpis && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            <KpiChip label="Actores" value={kpis.actors.active} sub={`${kpis.actors.total} total`} />
            <KpiChip label="Recomendadores" value={kpis.recommenders.active} sub={`${kpis.recommenders.client_links} clientes`} />
            <KpiChip label="Comisionistas" value={kpis.commission_agents.active} />
            <KpiChip label="Afiliados" value={kpis.affiliates.active} sub={`${kpis.affiliates.total} total`} />
            <KpiChip label="Facturado" value={`${fmt(kpis.invoices.total_invoiced)} €`} />
            <KpiChip label="Cobrado" value={`${fmt(kpis.invoices.total_paid)} €`} />
            <KpiChip label="Pendiente" value={`${fmt(kpis.invoices.total_unpaid)} €`} warn={kpis.invoices.total_unpaid > 0} />
            <KpiChip label="Vencidas" value={kpis.invoices.overdue} warn={kpis.invoices.overdue > 0} />
            <KpiChip label="Liquidaciones pend." value={kpis.liquidations.pending} warn={kpis.liquidations.pending > 0} />
            <KpiChip label="Warnings críticos" value={kpis.warnings.critical} warn={kpis.warnings.critical > 0} />
          </div>
        )}
        {loading && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>Cargando métricas globales…</div>}
      </div>

      {/* ── 9 Modules grid ─────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Row 1: Governance + Actors */}
        <div style={twoCol}>
          <GovernanceModule />
          <ActorsModule />
        </div>

        {/* Row 2: Recommenders (full width) */}
        <RecommendersModule />

        {/* Row 3: Commission Agents (full width) */}
        <CommissionAgentsModule />

        {/* Row 4: Shopify + BixGrow */}
        <div style={twoCol}>
          <ShopifyModule shopifyConfigured={kpis?.shopify?.configured} />
          <BixGrowModule kpis={kpis ? { total: kpis.affiliates.total, active: kpis.affiliates.active, client_links: kpis.recommenders.client_links } : undefined} />
        </div>

        {/* Row 5: Liquidations + Economic */}
        <div style={twoCol}>
          <LiquidationsModule kpis={kpis?.liquidations} />
          <EconomicModule kpis={kpis?.invoices} />
        </div>

        {/* Row 6: System Integrity (full width) */}
        <SystemModule kpis={kpis?.warnings} />
      </div>
    </div>
  );
}

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 10,
};
