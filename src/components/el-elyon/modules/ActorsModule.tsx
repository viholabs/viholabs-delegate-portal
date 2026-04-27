"use client";

import { useEffect, useState } from "react";
import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";

type Actor = { id: string; name: string; role: string | null; status: string | null; email: string | null; roles: string[]; commission_level?: number | null };

const ROLE_LABELS: Record<string, string> = {
  melquisedec: "Melquisedec",
  super_admin: "Super Admin",
  delegate: "Delegado",
  KOL: "KOL",
  COMMISSION_AGENT: "Comisionista",
  COORDINATOR_COMMERCIAL: "Coordinador",
  client: "Cliente",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#065f46", inactive: "#b91c1c", suspended: "#92400e",
};

export default function ActorsModule() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/el-elyon/actors", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setActors(d.actors ?? []); })
      .finally(() => setLoading(false));
  }, []);

  const active = actors.filter((a) => a.status === "active").length;
  const inactive = actors.filter((a) => a.status !== "active" && a.status != null).length;
  const delegates = actors.filter((a) => a.role === "delegate" || (a.roles ?? []).includes("delegate")).length;
  const kols = actors.filter((a) => a.role === "KOL" || (a.roles ?? []).includes("KOL")).length;
  const agents = actors.filter((a) => a.role === "COMMISSION_AGENT").length;

  const status: ModuleStatus = loading ? "loading" : inactive > 0 ? "warning" : "ok";

  return (
    <ElElyonModuleCard
      icon="👥"
      title="Gestión de Actores"
      subtitle="Actores, roles múltiples, permisos y overrides"
      status={status}
      kpis={
        <>
          <KpiChip label="Actores" value={actors.length} />
          <KpiChip label="Activos" value={active} />
          <KpiChip label="Delegados" value={delegates} />
          <KpiChip label="KOLs" value={kols} />
          <KpiChip label="Comisionistas" value={agents} />
        </>
      }
    >
      <Subcard title="Todos los actores" defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>Cargando…</div>}
          {actors.map((a) => {
            const allRoles = [...new Set([a.role, ...(a.roles ?? [])].filter(Boolean))] as string[];
            return (
              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", borderRadius: 8, background: a.status !== "active" ? "rgba(185,28,28,0.04)" : "rgba(255,255,255,0.5)", border: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>{a.email ?? "sin email"}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "flex-end" }}>
                  {allRoles.map((r) => (
                    <span key={r} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(90,46,58,0.08)", color: "#5a2e3a", fontWeight: 600 }}>
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                  <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, fontWeight: 600, color: STATUS_COLORS[a.status ?? ""] ?? "#6b7280", background: STATUS_COLORS[a.status ?? ""] ? `${STATUS_COLORS[a.status ?? ""]}15` : "rgba(107,114,128,0.1)" }}>
                    {a.status ?? "desconocido"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Subcard>

      <Subcard title="Actores con múltiples roles">
        {actors.filter((a) => (a.roles ?? []).length > 1).length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            Ejemplo: Isabel Solé Mesas tiene roles KOL + cliente + delegado activos simultáneamente.
            Una persona puede tener varios roles simultáneos.
          </div>
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

      <Subcard title="Permisos y overrides">
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Los overrides de permisos permiten excepciones temporales con <code>valid_from</code> / <code>valid_to</code>.
          Regla de precedencia: override actor &gt; rol · deny prevalece sobre allow.
          Gestión de overrides disponible en próxima iteración.
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
