"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import useCommunityProfile from "@/components/portal/community/useCommunityProfile";

import TechnicalTab from "@/components/control-room/technical/TechnicalTab";
import ElElyonControlBlock from "@/components/control-room/resources/ElElyonControlBlock";
import ResourcesHubBlock from "@/components/control-room/resources/ResourcesHubBlock";
import HoldedDocumentsTable from "@/components/control-room/invoices/HoldedDocumentsTable";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ShellTabId =
  | "situation"
  | "clients"
  | "facturacion"
  | "recursos"
  | "el-elyon";

function SituationPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Situation</CardTitle>
      </CardHeader>
      <CardContent className="text-sm" style={{ color: "var(--viho-muted)" }}>
        Dashboard principal del actor.
      </CardContent>
    </Card>
  );
}

function ClientsPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clients</CardTitle>
      </CardHeader>
      <CardContent className="text-sm" style={{ color: "var(--viho-muted)" }}>
        Dominio relacional y comercial del actor.
      </CardContent>
    </Card>
  );
}

function FacturacionPanel() {
  return <HoldedDocumentsTable />;
}

function RecursosPanel() {
  return (
    <div className="space-y-4">
      <ResourcesHubBlock />

      <Card>
        <CardHeader>
          <CardTitle>Recursos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm" style={{ color: "var(--viho-muted)" }}>
          Recursos contiene formación, documentación, materiales y soportes del
          actor.
        </CardContent>
      </Card>
    </div>
  );
}

function ElElyonPanel() {
  return (
    <div className="space-y-4">
      <ElElyonControlBlock />
      <TechnicalTab />
    </div>
  );
}

function normalizeTab(value: string | null, isMelquisedec: boolean): ShellTabId {
  if (value === "situation") return "situation";
  if (value === "clients") return "clients";
  if (value === "facturacion") return "facturacion";
  if (value === "recursos") return "recursos";
  if (value === "el-elyon" && isMelquisedec) return "el-elyon";
  return "situation";
}

export default function ShellPageClient() {
  const searchParams = useSearchParams();
  const { isMelquisedec } = useCommunityProfile();

  const activeTab = useMemo(
    () => normalizeTab(searchParams.get("tab"), isMelquisedec),
    [searchParams, isMelquisedec]
  );

  switch (activeTab) {
    case "clients":
      return <ClientsPanel />;

    case "facturacion":
      return <FacturacionPanel />;

    case "recursos":
      return <RecursosPanel />;

    case "el-elyon":
      return <ElElyonPanel />;

    case "situation":
    default:
      return <SituationPanel />;
  }
}