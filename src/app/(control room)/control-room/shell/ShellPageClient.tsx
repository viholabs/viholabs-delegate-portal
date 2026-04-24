"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import ControlRoomMission from "@/components/control-room/dashboard/ControlRoomMission";
import ResourcesHubBlock from "@/components/control-room/resources/ResourcesHubBlock";
import HoldedDocumentsTable from "@/components/control-room/invoices/HoldedDocumentsTable";
import ClientsPanel from "@/components/control-room/clients/ClientsPanel";
import CommissionAgentDashboard from "@/components/commission-agent/CommissionAgentDashboard";
import { useCommunityProfile } from "@/components/portal/community/useCommunityProfile";

// ---------------------------------------------------------------------------
// Types and shared tab logic
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section entry card (Recursos-style)
// ---------------------------------------------------------------------------

function SectionCard({
  eyebrow,
  title,
  description,
  onClick,
  disabled,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <article
      onClick={disabled ? undefined : onClick}
      className={[
        "rounded-[28px] border border-[#D6C28A] bg-white/70 p-5 transition",
        disabled ? "opacity-60" : onClick ? "cursor-pointer hover:border-[#C7822A] hover:shadow-md" : "",
      ].join(" ")}
    >
      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A775C]">
        {eyebrow}
      </div>
      <h3 className="mt-3 text-[22px] font-semibold text-[#5A2E3A]">{title}</h3>
      <p className="mt-3 text-[15px] leading-7 text-[#6E5B43]">{description}</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function SituationPanel({ onNavigate }: { onNavigate: (tab: ShellTabId) => void }) {
  const { profile, loading } = useCommunityProfile();
  const role = String(profile.role ?? "").toLowerCase();
  const isDelegate = !loading && role === "delegate";

  const cards: { eyebrow: string; title: string; description: string; tab?: ShellTabId; disabled?: boolean }[] = [
    {
      eyebrow: "Facturación",
      title: "Facturas Emitidas",
      description: "Revisa tus facturas del mes, cobros y estado de cada documento.",
      tab: "facturacion",
    },
    {
      eyebrow: "Cartera",
      title: "Mis Clientes",
      description: "Consulta y gestiona tu cartera de clientes asignados.",
      tab: "clients",
    },
    {
      eyebrow: "Contenido",
      title: "Recursos",
      description: "Accede a webinars, cursos y materiales de formación.",
      tab: "recursos",
    },
    ...(profile.is_melquisedec
      ? [
          {
            eyebrow: "Operación",
            title: "El-Elyon",
            description: "Panel interno de operación y monitorización del sistema.",
            tab: "el-elyon" as ShellTabId,
          },
        ]
      : []),
  ];

  return (
    <section className="rounded-[32px] border border-[#D6C28A] bg-[#FBF6EC]">
      <div className="border-b border-[#D6C28A] px-6 py-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
          Portal del delegado
        </div>
        <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-[#5A2E3A]">
          Bienvenido
        </h2>
        <p className="mt-3 max-w-[680px] text-[15px] leading-7 text-[#6E5B43]">
          Tu espacio de gestión comercial. Consulta tus facturas, clientes y rendimiento desde aquí.
        </p>
      </div>
      <div className="grid gap-5 px-6 py-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <SectionCard
            key={c.tab ?? c.title}
            eyebrow={c.eyebrow}
            title={c.title}
            description={c.description}
            onClick={c.tab ? () => onNavigate(c.tab!) : undefined}
            disabled={c.disabled}
          />
        ))}
      </div>
    </section>
  );
}

function ClientsShellPanel({ clientId }: { clientId?: string | null }) {
  return <ClientsPanel initialClientId={clientId} />;
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
  const { profile, loading } = useCommunityProfile();

  if (loading) {
    return <p className="text-sm py-6" style={{ color: "var(--viho-muted)" }}>Cargando…</p>;
  }

  if (!profile.is_melquisedec) {
    return (
      <section className="rounded-[32px] border border-[#D6C28A] bg-[#FBF6EC] px-6 py-8">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
          El-Elyon
        </div>
        <h2 className="mt-2 text-[22px] font-semibold text-[#5A2E3A]">
          Área de uso interno
        </h2>
        <p className="mt-3 text-[15px] leading-7 text-[#6E5B43]">
          Este panel está reservado para el equipo de operaciones de Viholabs.
        </p>
      </section>
    );
  }

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

// ---------------------------------------------------------------------------
// Shell root
// ---------------------------------------------------------------------------

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
        return <SituationPanel onNavigate={setActiveTab} />;

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
        return <SituationPanel onNavigate={setActiveTab} />;
    }
  }, [activeTab, clientId]);

  return (
    <div
      className="flex flex-col gap-4"
      style={{ width: "100%", minWidth: 0 }}
    >
      <div style={{ width: "100%", minWidth: 0 }}>{content}</div>
    </div>
  );
}
