"use client";

// src/components/control-room/technical/TechnicalTab.tsx

import { useState } from "react";

import Z0SystemStatus from "./blocks/Z0SystemStatus";
import Z1SubsystemsLive from "./blocks/Z1SubsystemsLive";
import Z2PipelinesLive from "./blocks/Z2PipelinesLive";
import Z3ViholetaStatusLive from "./blocks/Z3ViholetaStatusLive";

/**
 * VIHOLABS — TECH BLOCK (CANÓNICO)
 * - Z0 sempre visible
 * - Z1 i Z2 plegats per defecte (optimitzar pantalla)
 * - Z3 Observability Viholeta (institucional, no tècnic)
 */

function SectionHeader(props: {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { title, subtitle, isOpen, onToggle } = props;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left rounded-2xl border px-4 py-3"
      style={{
        borderColor: "var(--viho-border)",
        background: "var(--viho-surface-1, var(--viho-surface))",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-muted)" }}>
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div className="text-xs font-semibold" style={{ color: "var(--viho-primary)" }} aria-hidden="true">
          {isOpen ? "Ocultar" : "Ver"}
        </div>
      </div>
    </button>
  );
}

export default function TechnicalTab() {
  const [openZ1, setOpenZ1] = useState(false);
  const [openZ2, setOpenZ2] = useState(false);

  return (
    <div className="viho-panel space-y-3">
      {/* Z0 — Estat del sistema (sempre visible) */}
      <Z0SystemStatus
        model={{
          status: "OK",
          openIncidentsCount: 0,
          lastCheckAt: "avui",
          summary: "Sense anomalies rellevants detectades.",
        }}
      />

      {/* Z1 — plegat */}
      <section className="space-y-2">
        <SectionHeader
          title="SUBSISTEMES & INTEGRACIONS"
          subtitle="Semàfor, última execució i incidències actives"
          isOpen={openZ1}
          onToggle={() => setOpenZ1((v) => !v)}
        />
        {openZ1 ? (
          <div
            className="rounded-2xl border p-3"
            style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
          >
            <Z1SubsystemsLive />
          </div>
        ) : null}
      </section>

      {/* Z2 — plegat */}
      <section className="space-y-2">
        <SectionHeader
          title="PIPELINES & INGESTA"
          subtitle="Últim lot, registres afectats i errors funcionals (si existeixen)"
          isOpen={openZ2}
          onToggle={() => setOpenZ2((v) => !v)}
        />
        {openZ2 ? (
          <div
            className="rounded-2xl border p-3"
            style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
          >
            <Z2PipelinesLive />
          </div>
        ) : null}
      </section>

      {/* Z3 — Viholeta Observability (sempre visible, compacte) */}
      <Z3ViholetaStatusLive />
    </div>
  );
}
