"use client";

import { useEffect, useState } from "react";
import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";

type Actor = { id: string; name: string; role: string | null; status: string | null; email: string | null; roles: string[] };

export default function GovernanceModule() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/el-elyon/actors", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setActors(d.actors ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = actors.filter((a) => a.status === "active").length;
  const inactive = actors.filter((a) => a.status !== "active").length;
  const multiRole = actors.filter((a) => (a.roles ?? []).length > 1).length;
  const noRole = actors.filter((a) => !(a.roles ?? []).length).length;
  const noEmail = actors.filter((a) => !a.email?.trim()).length;

  const status: ModuleStatus = loading ? "loading" : noRole > 0 || noEmail > 0 ? "warning" : "ok";

  const roleGroups = actors.reduce<Record<string, Actor[]>>((acc, a) => {
    const r = a.role ?? "sin rol";
    (acc[r] ??= []).push(a);
    return acc;
  }, {});

  return (
    <ElElyonModuleCard
      icon="👑"
      title="Governance / Soberanía"
      subtitle="Estructura canónica, actores, roles y asignaciones"
      status={status}
      kpis={
        <>
          <KpiChip label="Actores" value={actors.length} />
          <KpiChip label="Activos" value={active} />
          <KpiChip label="Multi-rol" value={multiRole} />
          <KpiChip label="Sin rol" value={noRole} warn={noRole > 0} />
          <KpiChip label="Sin email" value={noEmail} warn={noEmail > 0} />
        </>
      }
    >
      <Subcard title="Actores por rol" defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(roleGroups).map(([role, list]) => (
            <div key={role} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{role}</span>
              <span style={{ opacity: 0.7 }}>{list.length} actores — {list.map((a) => a.name).join(", ")}</span>
            </div>
          ))}
          {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>Cargando…</div>}
        </div>
      </Subcard>

      <Subcard title="Actores con múltiples roles">
        {multiRole === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.6 }}>Ningún actor tiene múltiples roles activos.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {actors.filter((a) => (a.roles ?? []).length > 1).map((a) => (
              <div key={a.id} style={{ fontSize: 12 }}>
                <strong>{a.name}</strong> — {(a.roles ?? []).join(", ")}
              </div>
            ))}
          </div>
        )}
      </Subcard>

      <Subcard title="Actores sin rol / sin email">
        {noRole === 0 && noEmail === 0 ? (
          <div style={{ fontSize: 12, color: "#065f46" }}>Sin problemas detectados.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {actors.filter((a) => !(a.roles ?? []).length || !a.email?.trim()).map((a) => (
              <div key={a.id} style={{ fontSize: 12 }}>
                <strong>{a.name}</strong> —{" "}
                {!(a.roles ?? []).length && <span style={{ color: "#b91c1c" }}>sin rol </span>}
                {!a.email?.trim() && <span style={{ color: "#92400e" }}>sin email</span>}
              </div>
            ))}
          </div>
        )}
      </Subcard>

      <Subcard title="Asignaciones y audit trail">
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Ver módulo <strong>System Integrity → Audit</strong> para historial completo de cambios.
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
