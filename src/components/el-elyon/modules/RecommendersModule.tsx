"use client";

import { useCallback, useEffect, useState } from "react";
import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";

type Recommender = {
  id: string;
  recommender_client_id: string;
  recommender_client_name: string | null;
  recommender_client_email: string | null;
  responsible_delegate_actor_id: string | null;
  delegate_name: string | null;
  commission_rate: number;
  status: string;
  valid_from: string;
  valid_to: string | null;
  notes: string | null;
  active_client_links: number;
};

type ClientSearchResult = { id: string; name: string | null; contact_email: string | null };

type LinkedClient = {
  id: string;
  recommended_client_id: string;
  client_name: string | null;
  client_email: string | null;
  delegate_name: string | null;
  status: string;
  valid_from: string;
  invoice_total: number | null;
  invoice_paid_total: number | null;
};

function fmt(n: number) { return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function RecommenderRow({ rec, onChanged }: { rec: Recommender; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LinkedClient[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ClientSearchResult[]>([]);
  const [linking, setLinking] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingLinks(true);
    fetch(`/api/el-elyon/recommenders/${rec.id}/client-links`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLinks(d.client_links ?? []))
      .finally(() => setLoadingLinks(false));
  }, [open, rec.id]);

  useEffect(() => {
    if (clientSearch.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/control-room/clients-search?q=${encodeURIComponent(clientSearch)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setSearchResults(d.clients ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [clientSearch]);

  async function linkClient(clientId: string) {
    setLinking(true);
    try {
      const res = await fetch(`/api/el-elyon/recommenders/${rec.id}/client-links`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommended_client_id: clientId }),
      });
      const d = await res.json();
      if (d.ok) { setShowLinkForm(false); setClientSearch(""); setOpen(false); onChanged(); }
      else alert(d.error);
    } finally { setLinking(false); }
  }

  async function unlinkClient(linkId: string) {
    if (!confirm("¿Desvincular este cliente recomendado?")) return;
    await fetch(`/api/el-elyon/recommenders/${rec.id}/client-links?link_id=${linkId}`, { method: "DELETE" });
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    onChanged();
  }

  const statusColor = rec.status === "active" ? "#065f46" : "#92400e";

  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.6)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", cursor: "pointer" }} onClick={() => setOpen((p) => !p)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{rec.recommender_client_name ?? rec.recommender_client_id}</div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
            {rec.recommender_client_email} · {rec.commission_rate}% comisión
            {rec.delegate_name && <> · Delegado: <strong>{rec.delegate_name}</strong></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{rec.status}</span>
          <span style={{ fontSize: 11, background: "rgba(0,0,0,0.06)", borderRadius: 6, padding: "2px 6px" }}>{rec.active_client_links} clientes</span>
          <span style={{ fontSize: 10, opacity: 0.4 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loadingLinks && <div style={{ fontSize: 12, opacity: 0.6 }}>Cargando clientes recomendados…</div>}

          {links.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Clientes recomendados</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {links.map((l) => (
                  <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{l.client_name || l.recommended_client_id}</span>
                      {l.client_email && <span style={{ opacity: 0.6, marginLeft: 6 }}>{l.client_email}</span>}
                      {l.invoice_total != null && (
                        <span style={{ marginLeft: 8, fontWeight: 700, color: "#1e40af" }}>
                          {fmt(l.invoice_total)} € facturado
                          {l.invoice_paid_total != null && l.invoice_paid_total < l.invoice_total && (
                            <span style={{ fontWeight: 400, opacity: 0.7 }}> ({fmt(l.invoice_paid_total)} € cobrado)</span>
                          )}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: l.status === "active" ? "rgba(6,95,70,0.1)" : "rgba(107,114,128,0.1)", color: l.status === "active" ? "#065f46" : "#6b7280" }}>{l.status}</span>
                    <button onClick={() => unlinkClient(l.id)} style={{ fontSize: 11, color: "#b91c1c", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loadingLinks && links.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>Sin clientes recomendados vinculados.</div>
          )}

          <div>
            <button
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(255,255,255,0.7)", cursor: "pointer" }}
              onClick={() => setShowLinkForm((p) => !p)}
            >
              {showLinkForm ? "Cancelar" : "+ Vincular cliente recomendado"}
            </button>
            {showLinkForm && (
              <div style={{ marginTop: 8, position: "relative" }}>
                <input
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
                  placeholder="Buscar cliente por nombre o email…"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {searchResults.length > 0 && (
                  <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "white", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 200, overflowY: "auto" }}>
                    {searchResults.map((c) => (
                      <div
                        key={c.id}
                        style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                        onMouseDown={() => { linkClient(c.id); setSearchResults([]); }}
                      >
                        <strong>{c.name}</strong>
                        {c.contact_email && <span style={{ opacity: 0.6, marginLeft: 6 }}>{c.contact_email}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {linking && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Vinculando…</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewRecommenderForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<ClientSearchResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [delegateSearch, setDelegateSearch] = useState("");
  const [delegateResults, setDelegateResults] = useState<{ id: string; name: string | null }[]>([]);
  const [selectedDelegate, setSelectedDelegate] = useState<{ id: string; name: string | null } | null>(null);
  const [commissionRate, setCommissionRate] = useState("");
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
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

  useEffect(() => {
    if (delegateSearch.length < 2) { setDelegateResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/control-room/actors-monitor`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setDelegateResults(((d.actors ?? []) as any[]).filter((a: any) => a.role === "delegate" && a.name?.toLowerCase().includes(delegateSearch.toLowerCase()))));
    }, 300);
    return () => clearTimeout(t);
  }, [delegateSearch]);

  async function save() {
    if (!selectedClient) { setErr("Selecciona el cliente recomendador"); return; }
    if (!commissionRate || Number(commissionRate) < 0) { setErr("Introduce un % de comisión válido"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/el-elyon/recommenders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommender_client_id: selectedClient.id,
          responsible_delegate_actor_id: selectedDelegate?.id ?? null,
          commission_rate: Number(commissionRate),
          valid_from: validFrom,
          notes: notes || null,
        }),
      });
      const d = await res.json();
      if (d.ok) onCreated();
      else setErr(d.error ?? "Error creando");
    } finally { setSaving(false); }
  }

  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "white" };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, display: "flex", flexDirection: "column", gap: 3 };

  return (
    <div style={{ border: "1px solid rgba(199,174,106,0.4)", borderRadius: 10, padding: 12, background: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>Nuevo recomendador</div>
      {err && <div style={{ fontSize: 11, color: "#b91c1c" }}>{err}</div>}

      <label style={label}>Cliente recomendador *
        <div style={{ position: "relative" }}>
          <input style={field} placeholder="Buscar cliente…" value={selectedClient ? selectedClient.name ?? selectedClient.id : clientSearch}
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

      <label style={label}>Delegado responsable (opcional)
        <div style={{ position: "relative" }}>
          <input style={field} placeholder="Buscar delegado…" value={selectedDelegate ? selectedDelegate.name ?? "" : delegateSearch}
            onChange={(e) => { setDelegateSearch(e.target.value); setSelectedDelegate(null); }} />
          {delegateResults.length > 0 && !selectedDelegate && (
            <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "white", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
              {delegateResults.map((a) => (
                <div key={a.id} style={{ padding: "5px 8px", fontSize: 12, cursor: "pointer" }}
                  onMouseDown={() => { setSelectedDelegate(a); setDelegateSearch(a.name ?? ""); setDelegateResults([]); }}>
                  {a.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={label}>% Comisión *
          <input style={field} type="number" min={0} step={0.01} value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} placeholder="Ej: 3.00" />
        </label>
        <label style={label}>Fecha inicio
          <input style={field} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
      </div>

      <label style={label}>Observaciones
        <textarea style={{ ...field, resize: "vertical", minHeight: 48 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas internas…" />
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, background: "#5a2e3a", color: "white", border: "none", cursor: "pointer" }}>
          {saving ? "Guardando…" : "Crear recomendador"}
        </button>
        <button onClick={onCancel} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "none", border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}

export default function RecommendersModule() {
  const [recommenders, setRecommenders] = useState<Recommender[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/el-elyon/recommenders", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRecommenders(d.recommenders ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = recommenders.filter((r) => r.status === "active").length;
  const noDel = recommenders.filter((r) => !r.responsible_delegate_actor_id).length;
  const totalLinks = recommenders.reduce((s, r) => s + r.active_client_links, 0);

  const status: ModuleStatus = loading ? "loading" : recommenders.length === 0 ? "empty" : noDel > 0 ? "warning" : "ok";

  return (
    <ElElyonModuleCard
      icon="🤝"
      title="Recomendadores"
      subtitle="Clientes que recomiendan otros clientes · Comisión deducida del delegado"
      status={status}
      kpis={
        <>
          <KpiChip label="Recomendadores" value={recommenders.length} />
          <KpiChip label="Activos" value={active} />
          <KpiChip label="Clientes vinculados" value={totalLinks} />
          <KpiChip label="Sin delegado" value={noDel} warn={noDel > 0} />
        </>
      }
    >
      <Subcard title="Registro de recomendadores" defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowNew((p) => !p)}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, background: "#5a2e3a", color: "white", border: "none", cursor: "pointer" }}
            >
              {showNew ? "Cancelar" : "+ Nuevo recomendador"}
            </button>
          </div>

          {showNew && (
            <NewRecommenderForm
              onCreated={() => { setShowNew(false); load(); }}
              onCancel={() => setShowNew(false)}
            />
          )}

          {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>Cargando…</div>}

          {!loading && recommenders.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.65, padding: "8px 0" }}>
              Sin recomendadores registrados. Un recomendador es un cliente que recomienda otros clientes y cuya comisión se deduce del delegado responsable.
            </div>
          )}

          {recommenders.map((r) => (
            <RecommenderRow key={r.id} rec={r} onChanged={load} />
          ))}
        </div>
      </Subcard>

      <Subcard title="Comisiones y deducciones al delegado">
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Las comisiones de recomendadores se calculan factura por factura sobre unidades tipo <strong>sale</strong> cobradas.
          La comisión resultante se deduce de la liquidación del delegado responsable.
          {recommenders.length === 0
            ? " Crea al menos un recomendador para ver los cálculos."
            : " Funcionalidad de cálculo disponible una vez creada la primera liquidación del periodo."}
        </div>
      </Subcard>

      <Subcard title="Conflictos detectados">
        {noDel > 0 ? (
          <div style={{ fontSize: 12, color: "#92400e" }}>
            {noDel} recomendador(es) sin delegado responsable asignado. Asigna un delegado para que las deducciones sean correctas.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#065f46" }}>Sin conflictos detectados.</div>
        )}
      </Subcard>
    </ElElyonModuleCard>
  );
}
