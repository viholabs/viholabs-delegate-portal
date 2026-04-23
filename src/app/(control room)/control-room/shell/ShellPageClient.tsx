"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import ControlRoomMission from "@/components/control-room/dashboard/ControlRoomMission";
import ResourcesHubBlock from "@/components/control-room/resources/ResourcesHubBlock";
import HoldedDocumentsTable from "@/components/control-room/invoices/HoldedDocumentsTable";
import ClientsPanel from "@/components/control-room/clients/ClientsPanel";
import CommissionAgentDashboard from "@/components/commission-agent/CommissionAgentDashboard";
import TabFacturacion from "@/components/control-room/delegates/detail/TabFacturacion";
import { useCommunityProfile } from "@/components/portal/community/useCommunityProfile";
import { getAccessToken } from "@/lib/auth/token";
import type { DetailInvoiceRow, DetailPeriodStats, CommissionRule } from "@/components/control-room/delegates/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function isoMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function DelegateOwnFacturacion({ actorId }: { actorId: string }) {
  const [month, setMonth] = useState(isoMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<DetailInvoiceRow[]>([]);
  const [period, setPeriod] = useState<DetailPeriodStats | null>(null);
  const [rules, setRules] = useState<CommissionRule[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/control-room/delegates/${encodeURIComponent(actorId)}?month=${month}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }
      );
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Error al cargar facturas");
      setInvoices(j.invoices ?? []);
      setPeriod(j.period ?? null);
      setRules(j.commission_rules ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [actorId, month]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(e) => setMonth(e.target.value + "-01")}
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)", color: "var(--viho-foreground)" }}
        />
        <button
          onClick={() => void load()}
          className="rounded-xl border px-3 py-2 text-sm transition hover:opacity-70"
          style={{ borderColor: "var(--viho-border)", color: "var(--viho-muted)" }}
        >
          Actualizar
        </button>
      </div>
      {loading && <p className="text-sm py-6" style={{ color: "var(--viho-muted)" }}>Cargando facturas…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && period && (
        <TabFacturacion invoices={invoices} month={month} period={period} commissionRules={rules} />
      )}
    </div>
  );
}

type ShellTabId =
  | "situation"
  | "clients"
  | "facturacion"
  | "recursos"
  | "el-elyon"
  | "comisiones-agente";

function isShellTabId(value: string | null): value is ShellTabId {
  return (
    value === "situation" ||
    value === "clients" ||
    value === "facturacion" ||
    value === "recursos" ||
    value === "el-elyon" ||
    value === "comisiones-agente"
  );
}

function SituationPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Situation</CardTitle>
      </CardHeader>
      <CardContent
        className="text-sm"
        style={{ color: "var(--viho-muted, rgba(42,29,32,0.72))" }}
      >
        Dashboard principal del actor.
      </CardContent>
    </Card>
  );
}

function ClientsShellPanel({ clientId }: { clientId?: string | null }) {
  return <ClientsPanel initialClientId={clientId} />;
}

function FacturacionPanel() {
  const { profile, loading } = useCommunityProfile();

  if (loading) {
    return <p className="text-sm py-6" style={{ color: "var(--viho-muted)" }}>Cargando…</p>;
  }

  const role = String(profile.role ?? "").toLowerCase();
  const actorId = profile.actor_id ?? profile.effective_actor_id;

  if (role === "delegate" && actorId) {
    return <DelegateOwnFacturacion actorId={actorId} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HoldedDocumentsTable />
    </div>
  );
}

function RecursosPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ResourcesHubBlock />
    </div>
  );
}

function ElElyonPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ControlRoomMission />
    </div>
  );
}

function ComisionesAgentePanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommissionAgentDashboard />
    </div>
  );
}

export default function ShellPageClient() {
  const searchParams = useSearchParams();

  const initialTab = useMemo<ShellTabId>(() => {
    const tabParam = searchParams.get("tab");
    return isShellTabId(tabParam) ? tabParam : "situation";
  }, [searchParams]);

  const clientId = searchParams.get("clientId") ?? null;

  const [activeTab, setActiveTab] = useState<ShellTabId>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const content = useMemo(() => {
    switch (activeTab) {
      case "situation":
        return <SituationPanel />;

      case "clients":
        return <ClientsShellPanel clientId={clientId} />;

      case "facturacion":
        return <FacturacionPanel />;

      case "recursos":
        return <RecursosPanel />;

      case "el-elyon":
        return <ElElyonPanel />;

      case "comisiones-agente":
        return <ComisionesAgentePanel />;

      default:
        return <SituationPanel />;
    }
  }, [activeTab]);

  return (
    <div
      className="flex flex-col gap-4"
      style={{ width: "100%", minWidth: 0 }}
    >
      <div style={{ width: "100%", minWidth: 0 }}>{content}</div>
    </div>
  );
}