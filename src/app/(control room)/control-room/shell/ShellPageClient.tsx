"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import ControlRoomMission from "@/components/control-room/dashboard/ControlRoomMission";
import ResourcesHubBlock from "@/components/control-room/resources/ResourcesHubBlock";
import HoldedDocumentsTable from "@/components/control-room/invoices/HoldedDocumentsTable";
import ClientsPanel from "@/components/control-room/clients/ClientsPanel";
import CommissionAgentDashboard from "@/components/commission-agent/CommissionAgentDashboard";
import OrdersConsoleTab from "@/components/control-room/orders/OrdersConsoleTab";
import TabFacturacion from "@/components/control-room/delegates/detail/TabFacturacion";
import { useCommunityProfile } from "@/components/portal/community/useCommunityProfile";
import { getAccessToken } from "@/lib/auth/token";
import type { DetailInvoiceRow, DetailPeriodStats, CommissionRule } from "@/components/control-room/delegates/types";

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

function SyncButton() {
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  const run = async () => {
    setState("running");
    setMsg("");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/holded/sync", {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok || res.ok) { setState("ok"); setMsg(j?.message ?? "Sync completado"); }
      else { setState("error"); setMsg(j?.error ?? `HTTP ${res.status}`); }
    } catch (e) {
      setState("error"); setMsg(String(e));
    }
    setTimeout(() => setState("idle"), 4000);
  };

  const colors: Record<string, string> = {
    idle: "#5A2E3A", running: "#6E5B43", ok: "#059669", error: "#dc2626",
  };
  const labels: Record<string, string> = {
    idle: "↻ Sync Holded", running: "Sincronizando…", ok: "✓ Listo", error: "✗ Error",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={run}
        disabled={state === "running"}
        style={{
          fontSize: 12, fontWeight: 600, padding: "4px 12px",
          borderRadius: 20, border: `1px solid ${colors[state]}`,
          color: colors[state], background: "transparent", cursor: state === "running" ? "not-allowed" : "pointer",
          opacity: state === "running" ? 0.7 : 1,
        }}
      >
        {labels[state]}
      </button>
      {msg && <span style={{ fontSize: 11, color: colors[state] }}>{msg}</span>}
    </div>
  );
}

function SituationPanel({ onNavigate }: { onNavigate: (tab: ShellTabId) => void }) {
  const { profile, loading } = useCommunityProfile();
  const role = String(profile.role ?? "").toLowerCase();
  const isDelegate = !loading && role === "delegate";

  const cards: { eyebrow: string; title: string; description: string; tab?: ShellTabId; disabled?: boolean }[] = [
    {
      eyebrow: "Pedidos",
      title: "Crear Pedido",
      description: "Genera un nuevo pedido para tus clientes directamente desde el portal.",
      tab: "facturacion",
    },
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
            Portal del delegado
          </div>
          {profile.is_melquisedec && <SyncButton />}
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

// ---------------------------------------------------------------------------
// Delegate invoice view
// ---------------------------------------------------------------------------

function isoMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function DelegateFacturas({ actorId }: { actorId: string }) {
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

// ---------------------------------------------------------------------------
// Facturación panel
// ---------------------------------------------------------------------------

type FacturacionView = "cards" | "pedidos" | "facturas";

function FacturacionPanel() {
  const { profile, loading } = useCommunityProfile();
  const [view, setView] = useState<FacturacionView>("cards");

  if (loading) {
    return <p className="text-sm py-6" style={{ color: "var(--viho-muted)" }}>Cargando…</p>;
  }

  const role = String(profile.role ?? "").toLowerCase();
  const actorId = profile.actor_id ?? profile.effective_actor_id;

  if (role === "delegate" && actorId) {
    if (view === "pedidos") {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setView("cards")}
            className="text-sm transition hover:opacity-70"
            style={{ color: "var(--viho-muted)" }}
          >
            ← Volver
          </button>
          <OrdersConsoleTab delegateMode />
        </div>
      );
    }

    if (view === "facturas") {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setView("cards")}
            className="text-sm transition hover:opacity-70"
            style={{ color: "var(--viho-muted)" }}
          >
            ← Volver
          </button>
          <DelegateFacturas actorId={actorId} />
        </div>
      );
    }

    return (
      <section className="rounded-[32px] border border-[#D6C28A] bg-[#FBF6EC]">
        <div className="border-b border-[#D6C28A] px-6 py-5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">Facturación</div>
          <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-[#5A2E3A]">Tu actividad comercial</h2>
        </div>
        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <SectionCard
            eyebrow="Pedidos"
            title="Crear Pedido"
            description="Genera un nuevo pedido para tus clientes directamente desde el portal."
            onClick={() => setView("pedidos")}
          />
          <SectionCard
            eyebrow="Facturas"
            title="Facturas Emitidas"
            description="Consulta tus facturas del mes, comisiones acumuladas y estado de cobro."
            onClick={() => setView("facturas")}
          />
        </div>
      </section>
    );
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
