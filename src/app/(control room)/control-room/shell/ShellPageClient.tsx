"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import ControlRoomMission from "@/components/control-room/dashboard/ControlRoomMission";
import ResourcesHubBlock from "@/components/control-room/resources/ResourcesHubBlock";
import HoldedDocumentsTable from "@/components/control-room/invoices/HoldedDocumentsTable";
import ClientsPanel from "@/components/control-room/clients/ClientsPanel";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ShellTabId =
  | "situation"
  | "clients"
  | "facturacion"
  | "recursos"
  | "el-elyon";

function isShellTabId(value: string | null): value is ShellTabId {
  return (
    value === "situation" ||
    value === "clients" ||
    value === "facturacion" ||
    value === "recursos" ||
    value === "el-elyon"
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

function ClientsShellPanel() {
  return <ClientsPanel />;
}

function FacturacionPanel() {
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

export default function ShellPageClient() {
  const searchParams = useSearchParams();

  const initialTab = useMemo<ShellTabId>(() => {
    const tabParam = searchParams.get("tab");
    return isShellTabId(tabParam) ? tabParam : "situation";
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<ShellTabId>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const content = useMemo(() => {
    switch (activeTab) {
      case "situation":
        return <SituationPanel />;

      case "clients":
        return <ClientsShellPanel />;

      case "facturacion":
        return <FacturacionPanel />;

      case "recursos":
        return <RecursosPanel />;

      case "el-elyon":
        return <ElElyonPanel />;

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