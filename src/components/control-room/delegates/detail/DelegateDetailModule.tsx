"use client";

// src/components/control-room/delegates/detail/DelegateDetailModule.tsx
// Orchestrador del detalle de un delegado: gestiona carga de datos y navegación por tabs.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DelegateDetailResponse, DelegateDetailApiResult } from "../types";
import { currentMonth } from "../utils";
import DelegateHeader from "./DelegateHeader";
import TabResumen from "./TabResumen";
import TabFacturacion from "./TabFacturacion";
import TabLiquidacion from "./TabLiquidacion";
import TabClientes from "./TabClientes";
import TabComisiones from "./TabComisiones";
import TabAuditoria from "./TabAuditoria";
import TabEditar from "./TabEditar";
import type { DelegateDetailActor } from "../types";

type Tab = "resumen" | "facturacion" | "liquidacion" | "clientes" | "comisiones" | "auditoria" | "editar";

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "facturacion", label: "Facturación" },
  { id: "liquidacion", label: "Liquidación" },
  { id: "clientes", label: "Clientes" },
];

// Tabs restringidos a Melquisedec
const MELQUISEDEC_TABS: { id: Tab; label: string }[] = [
  { id: "comisiones", label: "Comisiones" },
  { id: "auditoria", label: "Auditoría" },
  { id: "editar", label: "Editar" },
];

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type Props = { delegateId: string };

export default function DelegateDetailModule({ delegateId }: Props) {
  const [month, setMonth] = useState<string>(currentMonth());
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DelegateDetailResponse | null>(null);
  const [delegateOverride, setDelegateOverride] = useState<DelegateDetailActor | null>(null);
  // Direct Melquisedec check via /api/control-room/me — uses the same auth
  // path as the delegate detail API so it's always consistent.
  const [isMelquisedecDirect, setIsMelquisedecDirect] = useState(false);

  useEffect(() => {
    async function checkMe() {
      const supabase = createClient();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;
      try {
        const res = await fetch("/api/control-room/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        const json = await res.json().catch(() => null) as { ok?: boolean; isMelquisedec?: boolean } | null;
        if (json?.ok && json.isMelquisedec) setIsMelquisedecDirect(true);
      } catch {
        // leave false
      }
    }
    void checkMe();
  }, []);

  const loadData = useCallback(
    async (targetMonth: string) => {
      setLoading(true);
      setError(null);

      try {
        const token = await getAccessToken();
        if (!token) {
          setError("Sesión no disponible");
          setLoading(false);
          return;
        }

        const res = await fetch(
          `/api/control-room/delegates/${encodeURIComponent(delegateId)}?month=${targetMonth}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const payload = (await res.json().catch(() => null)) as DelegateDetailApiResult | null;

        if (!res.ok || !payload || !payload.ok) {
          const errMsg = payload && !payload.ok ? payload.error : "Error al cargar la ficha";
          setError(errMsg);
          setData(null);
          setLoading(false);
          return;
        }

        setData(payload);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
        setData(null);
        setLoading(false);
      }
    },
    [delegateId]
  );

  useEffect(() => {
    void loadData(month);
  }, [month, loadData]);

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-[color:var(--viho-muted)]">
          Cargando ficha del delegado…
        </div>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div className="space-y-4 p-6">
        <a
          href="/control-room/delegates"
          className="inline-flex items-center gap-2 text-sm text-[color:var(--viho-muted)] hover:text-[color:var(--viho-primary)]"
        >
          ← Volver a delegados
        </a>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const delegate = delegateOverride ?? data.delegate;
  // Three independent sources — any one being true is enough.
  const canMelquisedec = isMelquisedecDirect || data.viewer.isMelquisedec;

  const tabs = canMelquisedec
    ? [...BASE_TABS, ...MELQUISEDEC_TABS]
    : BASE_TABS;

  // Viewer object passed down to child tabs, always reflects correct Melquisedec status
  const viewer = { ...data.viewer, isMelquisedec: canMelquisedec, canEdit: canMelquisedec };

  return (
    <div className="space-y-0">
      {/* Cabecera: back, info del delegado, KPIs, month picker */}
      <DelegateHeader
        delegate={delegate}
        period={data.period}
        month={month}
        onMonthChange={setMonth}
        viewer={viewer}
      />

      {/* Navegación de tabs */}
      <div className="sticky top-0 z-10 border-b border-[color:var(--viho-border)] bg-white">
        <div className="flex gap-0 overflow-x-auto px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "shrink-0 border-b-2 px-5 py-4 text-sm font-semibold transition-colors",
                activeTab === tab.id
                  ? "border-[color:var(--viho-primary)] text-[color:var(--viho-primary)]"
                  : "border-transparent text-[color:var(--viho-muted)] hover:text-[color:var(--viho-primary)]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido del tab activo */}
      <div className="min-h-[50vh] bg-[color:var(--viho-surface-2,#f9f7f4)] p-6">
        {activeTab === "resumen" && (
          <TabResumen period={data.period} delegate={delegate} />
        )}
        {activeTab === "facturacion" && (
          <TabFacturacion
            invoices={data.invoices}
            month={month}
            period={data.period}
            commissionRules={data.commission_rules}
          />
        )}
        {activeTab === "liquidacion" && (
          <TabLiquidacion
            settlement={data.settlement}
            period={data.period}
            month={month}
            delegate={delegate}
            viewer={viewer}
            onRefresh={() => void loadData(month)}
          />
        )}
        {activeTab === "clientes" && (
          <TabClientes clients={data.clients} month={month} />
        )}
        {activeTab === "comisiones" && canMelquisedec && (
          <TabComisiones
            rules={data.commission_rules}
            period={data.period}
            viewer={viewer}
            delegate={delegate}
            onRefresh={() => void loadData(month)}
          />
        )}
        {activeTab === "auditoria" && canMelquisedec && (
          <TabAuditoria audit={data.audit} delegate={delegate} />
        )}
        {activeTab === "editar" && canMelquisedec && (
          <TabEditar
            delegate={delegate}
            onSaved={(updated) => setDelegateOverride(updated)}
          />
        )}
      </div>
    </div>
  );
}
