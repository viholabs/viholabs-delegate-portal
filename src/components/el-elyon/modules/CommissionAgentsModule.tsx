"use client";

import { useCallback, useEffect, useState } from "react";
import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";

type Agent = {
  id: string;
  name: string;
  email: string | null;
  status: string | null;
  company: string | null;
  agent_type: string;
  country: string | null;
  currency: string;
  active_client_links: number;
  default_commission_rate: number | null;
  commission_rules: { channel: string; percentage: number }[];
  level_structures: { client_id: string; level: number; commission_rate: number }[];
};

type ClientSearchResult = { id: string; name: string | null; contact_email: string | null };

function fmt(n: number) { return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function LevelStructureForm({ agentId, onCreated, onCancel }: { agentId: string; onCreated: () => void; onCancel: () => void }) {
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<ClientSearchResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [level, setLevel] = useState("1");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (clientSearch.length < 2) { setClientResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/control-room/clients-search?q=${encodeURIComponent(clientSearch)}`, { cache: "no-store" })
        .then((r) => r.json()).then((d) => setClientResults(d.clients ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [clientSearch]);

  async function save() {
    if (!selectedClient) { setErr("Selecciona un cliente"); return; }
    const lv = Number(level);
    if (lv < 1 || lv > 5) { setErr("Nivel debe ser 1-5"); return; }
    if (!rate || Number(rate) < 0) { setErr("Introduce un % válido"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/el-elyon/commission-agents/${agentId}/level-structures`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selectedClient.id, level: lv, commission_rate: Number(rate) }),
      });
      const d = await res.json();
      if (d.ok) onCreated();
      else setErr(d.error ?? "Error");
    } finally { setSaving(false); }
  }

  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "white" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, display: "flex", flexDirection: "column", gap: 3 };

  return (
    <div style={{ border: "1px solid rgba(199,174,106,0.3)", borderRadius: 8, padding: 10, background: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700 }}>Nueva estructura de nivel</div>
      {err && <div style={{ fontSize: 11, color: "#b91c1c" }}>{err}</div>}
      <label style={lbl}>Cliente
        <div style={{ position: "relative" }}>
          <input style={field} placeholder="Buscar cliente…" value={selectedClient ? selectedClient.name ?? "" : clientSearch}
            onChange={(e) => { setClientSearch(e.target.value); setSelectedClient(null); }} />
          {clientResults.length > 0 && !selectedClient && (
            <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "white", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
              {clientResults.map((c) => (
                <div key={c.id} style={{ padding: "5px 8px", fontSize: 12, cursor: "pointer" }}
                  onMouseDown={() => { setSelectedClient(c); setClientSearch(c.name ?? ""); setClientResults([]); }}>
                  <strong>{c.name}</strong> <span style={{ opacity: 0.6 }}>{c.contact_email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <label style={lbl}>Nivel (1-5)
          <select style={field} value={level} onChange={(e) => setLevel(e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Nivel {n}</option>)}
          </select>
        </label>
        <label style={lbl}>% Comisión
          <input style={field} type="number" min={0} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ej: 5.00" />
        </label>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} disabled={saving} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "#5a2e3a", color: "white", border: "none", cursor: "pointer" }}>
          {saving ? "Guardando…" : "Crear estructura"}
        </button>
        <button onClick={onCancel} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "none", border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}

function AgentCard({ agent, onChanged }: { agent: Agent; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState<any[]>([]);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [showLevelForm, setShowLevelForm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingLevels(true);
    fetch(`/api/el-elyon/commission-agents/${agent.id}/level-structures`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLevels(d.level_structures ?? []))
      .finally(() => setLoadingLevels(false));
  }, [open, agent.id]);

  async function removeLevel(structureId: string) {
    if (!confirm("¿Eliminar esta estructura de nivel?")) return;
    await fetch(`/api/el-elyon/commission-agents/${agent.id}/level-structures?structure_id=${structureId}`, { method: "DELETE" });
    setLevels((prev) => prev.filter((l) => l.id !== structureId));
    onChanged();
  }

  const typeLabel = agent.agent_type === "international" ? "Internacional" : "Nacional";
  const typeColor = agent.agent_type === "international" ? "#1e40af" : "#065f46";

  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.6)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", cursor: "pointer" }} onClick={() => setOpen((p) => !p)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{agent.name}</div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
            {agent.email}
            {agent.country && <> · {agent.country}</>}
            {agent.default_commission_rate != null && <> · {agent.default_commission_rate}% comisión base</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: typeColor, padding: "1px 6px", borderRadius: 4, background: `${typeColor}18`, border: `1px solid ${typeColor}30` }}>{typeLabel}</span>
          <span style={{ fontSize: 10 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Commission rules from existing table */}
          {agent.commission_rules.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Reglas de comisión (pdv)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {agent.commission_rules.map((r, i) => (
                  <div key={i} style={{ fontSize: 12 }}>
                    Canal <strong>{r.channel}</strong> — <strong>{r.percentage}%</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Level structures */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>Estructura multinivel (por cliente)</span>
              <button onClick={() => setShowLevelForm((p) => !p)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#5a2e3a", color: "white", border: "none", cursor: "pointer" }}>
                {showLevelForm ? "Cancelar" : "+ Nivel"}
              </button>
            </div>
            {showLevelForm && (
              <LevelStructureForm
                agentId={agent.id}
                onCreated={() => { setShowLevelForm(false); setOpen(false); onChanged(); }}
                onCancel={() => setShowLevelForm(false)}
              />
            )}
            {loadingLevels && <div style={{ fontSize: 11, opacity: 0.6 }}>Cargando…</div>}
            {!loadingLevels && levels.length === 0 && !showLevelForm && (
              <div style={{ fontSize: 11, opacity: 0.6 }}>Sin estructuras multinivel definidas.</div>
            )}
            {levels.map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                <span style={{ fontWeight: 700, color: "#5a2e3a", minWidth: 60 }}>Nivel {l.level}</span>
                <span style={{ flex: 1 }}>{l.client_name ?? l.client_id}</span>
                <span style={{ fontWeight: 600 }}>{fmt(Number(l.commission_rate))}%</span>
                <button onClick={() => removeLevel(l.id)} style={{ fontSize: 11, color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommissionAgentsModule() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/el-elyon/commission-agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = agents.filter((a) => a.status === "active").length;
  const international = agents.filter((a) => a.agent_type === "international").length;
  const totalLinks = agents.reduce((s, a) => s + a.active_client_links, 0);
  const withLevels = agents.filter((a) => a.level_structures.length > 0).length;

  const status: ModuleStatus = loading ? "loading" : agents.length === 0 ? "empty" : "ok";

  return (
    <ElElyonModuleCard
      icon="🌐"
      title="Comisionistas"
      subtitle="Comisionistas nacionales e internacionales · Estructura multinivel hasta 5 niveles"
      status={status}
      kpis={
        <>
          <KpiChip label="Comisionistas" value={agents.length} />
          <KpiChip label="Activos" value={active} />
          <KpiChip label="Internacionales" value={international} />
          <KpiChip label="Clientes vinculados" value={totalLinks} />
          <KpiChip label="Con estructura nivel" value={withLevels} />
        </>
      }
    >
      <Subcard title="Registro de comisionistas" defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>Cargando…</div>}
          {!loading && agents.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Sin comisionistas. Los comisionistas son actores con rol <strong>COMMISSION_AGENT</strong>. Créalos desde Gestión de Actores.
            </div>
          )}
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} onChanged={load} />
          ))}
        </div>
      </Subcard>

      <Subcard title="Estructura multinivel por cliente">
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Define hasta 5 niveles de comisión por cliente. Expande un comisionista y usa <strong>+ Nivel</strong> para añadir estructura.
          Cada nivel tiene su % de comisión independiente. Las facturas cobradas generarán comisión por cada nivel activo.
        </div>
      </Subcard>

      <Subcard title="Comisiones por factura">
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Las comisiones se calculan sobre <strong>facturas cobradas</strong> (is_paid=true), solo unidades tipo <strong>sale</strong>.
          Promos no generan comisión. CN/abonos restan. Disponible una vez creada la primera liquidación del periodo.
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
