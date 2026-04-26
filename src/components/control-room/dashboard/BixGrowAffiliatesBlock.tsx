"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type AffiliateStats = {
  total_events: number;
  total_clients: number;
  total_sales: number;
  total_commission: number;
  total_liquidated: number;
  pending_liquidation: number;
};

type LinkedClient = {
  event_id: string;
  client_id: string;
  client_name: string | null;
  client_email: string | null;
  source: string;
  commission_amount: number | null;
  order_amount: number | null;
  removable: boolean;
};

type Affiliate = {
  id: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
  referral_code: string | null;
  state_code: string | null;
  source: string | null;
  commission_value: number | null;
  commission_type: string | null;
  synced_at: string | null;
  stats: AffiliateStats;
  clients: LinkedClient[];
};

type ClientResult = { id: string; name: string | null; email: string | null; status: string | null };

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt(n: number) {
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function sourceLabel(src: string) {
  const map: Record<string, string> = {
    bixgrow: "webhook",
    email_match: "email",
    manual: "manual",
    manual_control_room: "manual",
    bixgrow_sync: "sync",
  };
  return map[src] ?? src;
}

function sourcePillStyle(src: string): React.CSSProperties {
  if (src === "bixgrow") return { background: "rgba(37,99,235,0.10)", color: "#1e40af" };
  if (src === "email_match") return { background: "rgba(5,150,105,0.10)", color: "#065f46" };
  return { background: "rgba(107,114,128,0.10)", color: "#374151" };
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function StatCell({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={statCellStyle}>
      <div style={{ ...statValStyle, ...(warn ? { color: "#92400e" } : {}) }}>{value}</div>
      <div style={statLabelStyle}>{label}</div>
    </div>
  );
}

function ClientRow({ lc, affiliateId, onUnlinked }: { lc: LinkedClient; affiliateId: string; onUnlinked: () => void }) {
  const [removing, setRemoving] = useState(false);

  async function unlink() {
    if (!confirm(`¿Desvincular "${lc.client_name || lc.client_id}"?`)) return;
    setRemoving(true);
    try {
      await fetch(`/api/control-room/bixgrow-affiliates/${affiliateId}/clients?client_id=${lc.client_id}`, { method: "DELETE" });
      onUnlinked();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div style={clientRowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{lc.client_name || lc.client_id}</div>
        {lc.client_email && <div style={{ fontSize: 11, opacity: 0.65 }}>{lc.client_email}</div>}
      </div>
      <span style={{ ...miniPill, ...sourcePillStyle(lc.source) }}>{sourceLabel(lc.source)}</span>
      {lc.removable && (
        <button style={iconBtn} onClick={unlink} disabled={removing} title="Desvincular">
          {removing ? "…" : "×"}
        </button>
      )}
    </div>
  );
}

function ClientSearchInput({
  affiliateId,
  onLinked,
}: {
  affiliateId: string;
  onLinked: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ClientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/control-room/clients-search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = await res.json();
        setResults(data.clients ?? []);
        setOpen(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [q]);

  async function link(client: ClientResult) {
    setLinking(true);
    setOpen(false);
    setQ("");
    try {
      const res = await fetch(`/api/control-room/bixgrow-affiliates/${affiliateId}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: client.id }),
      });
      const data = await res.json();
      if (data.ok) onLinked();
      else alert(data.error || "Error vinculando");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        style={searchInput}
        placeholder={linking ? "Vinculando…" : "Buscar cliente para vincular…"}
        value={q}
        disabled={linking}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div style={dropdown}>
          {results.map((c) => (
            <div key={c.id} style={dropdownItem} onMouseDown={() => link(c)}>
              <span style={{ fontWeight: 600 }}>{c.name || "—"}</span>
              {c.email && <span style={{ opacity: 0.65, marginLeft: 6 }}>{c.email}</span>}
            </div>
          ))}
        </div>
      )}
      {searching && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>Buscando…</div>}
    </div>
  );
}

function AffiliateCard({
  aff,
  onChanged,
}: {
  aff: Affiliate;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    name: aff.name ?? "",
    email: aff.email ?? "",
    referral_code: aff.referral_code ?? "",
    affiliate_external_id: aff.affiliate_external_id ?? "",
    commission_value: aff.commission_value != null ? String(aff.commission_value) : "",
    commission_type: aff.commission_type ?? "",
    state_code: aff.state_code ?? "OPEN",
  });
  const s = aff.stats;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/control-room/bixgrow-affiliates/${aff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          commission_value: form.commission_value ? Number(form.commission_value) : null,
        }),
      });
      const data = await res.json();
      if (data.ok) { setEditing(false); onChanged(); }
      else alert(data.error || "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm(`¿Eliminar afiliado "${aff.name}"? Se eliminarán también sus eventos de atribución.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/control-room/bixgrow-affiliates/${aff.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setDeleting(false);
    }
  }

  const stateColor = aff.state_code === "OPEN" ? "#065f46" : "#6b7280";
  const stateBg = aff.state_code === "OPEN" ? "rgba(5,150,105,0.10)" : "rgba(107,114,128,0.10)";

  return (
    <div style={affCard}>
      {/* Header row */}
      <div style={affHeader} onClick={() => !editing && setExpanded((p) => !p)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !editing && setExpanded((p) => !p)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={affName}>{aff.name || "—"}</span>
            <span style={{ ...miniPill, background: stateBg, color: stateColor }}>
              {aff.state_code || "—"}
            </span>
            {s.pending_liquidation > 0 && (
              <span style={{ ...miniPill, background: "rgba(217,119,6,0.10)", color: "#92400e" }}>
                pendiente {fmt(s.pending_liquidation)} €
              </span>
            )}
          </div>
          <div style={affMeta}>
            {aff.email && <span>{aff.email}</span>}
            {aff.referral_code && <span>código: <strong>{aff.referral_code}</strong></span>}
            {aff.commission_value != null && (
              <span>{aff.commission_value}{aff.commission_type ? ` ${aff.commission_type}` : ""}</span>
            )}
            <span style={{ opacity: 0.5 }}>{s.total_clients} clientes · {fmt(s.total_commission)} € comisión</span>
          </div>
        </div>
        <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0, marginTop: 2 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={expandBody}>
          {/* Stats */}
          <div style={statsGrid}>
            <StatCell label="Ventas" value={`${fmt(s.total_sales)} €`} />
            <StatCell label="Comisión" value={`${fmt(s.total_commission)} €`} />
            <StatCell label="Liquidado" value={`${fmt(s.total_liquidated)} €`} />
            <StatCell label="Pendiente" value={`${fmt(s.pending_liquidation)} €`} warn={s.pending_liquidation > 0} />
            <StatCell label="Eventos" value={String(s.total_events)} />
            <StatCell label="Clientes" value={String(s.total_clients)} />
          </div>

          {/* Clientes vinculados */}
          <div style={section}>
            <div style={sectionTitle}>Clientes vinculados</div>
            {aff.clients.length === 0
              ? <div style={muted}>Sin clientes vinculados.</div>
              : aff.clients.map((lc) => (
                <ClientRow key={lc.event_id} lc={lc} affiliateId={aff.id} onUnlinked={onChanged} />
              ))
            }
            <div style={{ marginTop: 8 }}>
              <ClientSearchInput affiliateId={aff.id} onLinked={onChanged} />
            </div>
          </div>

          {/* Edit form */}
          {editing ? (
            <div style={section}>
              <div style={sectionTitle}>Editar afiliado</div>
              <div style={formGrid}>
                <label style={fieldLabel}>Nombre *
                  <input style={fieldInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label style={fieldLabel}>Email
                  <input style={fieldInput} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
                <label style={fieldLabel}>Código referido
                  <input style={fieldInput} value={form.referral_code} onChange={(e) => setForm({ ...form, referral_code: e.target.value })} />
                </label>
                <label style={fieldLabel}>ID externo BixGrow
                  <input style={fieldInput} value={form.affiliate_external_id} onChange={(e) => setForm({ ...form, affiliate_external_id: e.target.value })} />
                </label>
                <label style={fieldLabel}>Comisión (valor)
                  <input style={fieldInput} type="number" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: e.target.value })} />
                </label>
                <label style={fieldLabel}>Comisión (tipo)
                  <input style={fieldInput} value={form.commission_type} placeholder="% / fijo / …" onChange={(e) => setForm({ ...form, commission_type: e.target.value })} />
                </label>
                <label style={fieldLabel}>Estado
                  <select style={fieldInput} value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value })}>
                    <option value="OPEN">OPEN</option>
                    <option value="CLOSED">CLOSED</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
                <button style={btnSecondary} onClick={() => setEditing(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button style={btnSecondary} onClick={() => setEditing(true)}>Editar</button>
              <button style={{ ...btnSecondary, color: "#b91c1c" }} onClick={del} disabled={deleting}>
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewAffiliateForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "", email: "", referral_code: "", affiliate_external_id: "",
    commission_value: "", commission_type: "", state_code: "OPEN",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!form.name.trim()) { setErr("El nombre es obligatorio"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/control-room/bixgrow-affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, commission_value: form.commission_value ? Number(form.commission_value) : null }),
      });
      const data = await res.json();
      if (data.ok) onCreated();
      else setErr(data.error || "Error creando");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={newFormCard}>
      <div style={sectionTitle}>Nuevo afiliado</div>
      {err && <div style={{ fontSize: 12, color: "#b91c1c" }}>{err}</div>}
      <div style={formGrid}>
        <label style={fieldLabel}>Nombre *
          <input style={fieldInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </label>
        <label style={fieldLabel}>Email
          <input style={fieldInput} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label style={fieldLabel}>Código referido
          <input style={fieldInput} value={form.referral_code} onChange={(e) => setForm({ ...form, referral_code: e.target.value })} />
        </label>
        <label style={fieldLabel}>ID externo BixGrow
          <input style={fieldInput} placeholder="ID de BixGrow si lo tienes" value={form.affiliate_external_id} onChange={(e) => setForm({ ...form, affiliate_external_id: e.target.value })} />
        </label>
        <label style={fieldLabel}>Comisión (valor)
          <input style={fieldInput} type="number" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: e.target.value })} />
        </label>
        <label style={fieldLabel}>Comisión (tipo)
          <input style={fieldInput} placeholder="% / fijo / …" value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value })} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={btnPrimary} onClick={create} disabled={saving}>{saving ? "Creando…" : "Crear afiliado"}</button>
        <button style={btnSecondary} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

/* ─── Main block ─────────────────────────────────────────────────────────── */

export default function BixGrowAffiliatesBlock() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/control-room/bixgrow-affiliates", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      setAffiliates(data.affiliates ?? []);
    } catch (e: any) {
      setError(e?.message || "Error cargando afiliados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function provision() {
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const res = await fetch("/api/control-room/bixgrow-affiliates/provision", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const parts = [];
        if (data.provisioned > 0) parts.push(`${data.provisioned} clientes creados`);
        if (data.linked > 0) parts.push(`${data.linked} vinculados`);
        if (data.already_linked > 0) parts.push(`${data.already_linked} ya vinculados`);
        if (data.errors > 0) parts.push(`${data.errors} errores`);
        setProvisionResult(parts.join(", ") || "Sin cambios necesarios");
        if (data.provisioned > 0 || data.linked > 0) load();
      } else {
        setProvisionResult("Error: " + (data.error || "desconocido"));
      }
    } finally {
      setProvisioning(false);
    }
  }

  async function autoMatch() {
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await fetch("/api/control-room/bixgrow-affiliates/auto-match", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMatchResult(`${data.matched} nuevos vínculos creados, ${data.already_linked} ya existían`);
        if (data.matched > 0) load();
      } else {
        setMatchResult("Error: " + (data.error || "desconocido"));
      }
    } finally {
      setMatching(false);
    }
  }

  const totals = affiliates.reduce(
    (acc, a) => ({
      sales: acc.sales + a.stats.total_sales,
      commission: acc.commission + a.stats.total_commission,
      pending: acc.pending + a.stats.pending_liquidation,
      clients: acc.clients + a.stats.total_clients,
    }),
    { sales: 0, commission: 0, pending: 0, clients: 0 }
  );

  return (
    <div style={card}>
      <div style={eyebrow}>El-Elyon · BixGrow</div>

      {/* Title + actions */}
      <div style={headerRow}>
        <div style={titleStyle}>Afiliados BixGrow</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={autoMatch} disabled={matching}>
            {matching ? "Procesando…" : "Auto-vincular por email"}
          </button>
          <button style={btnSecondary} onClick={provision} disabled={provisioning}>
            {provisioning ? "Provisionando…" : "Provisionar clientes"}
          </button>
          <button style={btnPrimary} onClick={() => setShowNew((p) => !p)}>
            {showNew ? "Cancelar" : "+ Nuevo afiliado"}
          </button>
        </div>
      </div>

      {matchResult && (
        <div style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, background: "rgba(5,150,105,0.09)", color: "#065f46" }}>
          {matchResult}
        </div>
      )}
      {provisionResult && (
        <div style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, background: "rgba(37,99,235,0.09)", color: "#1e40af" }}>
          Provision: {provisionResult}
        </div>
      )}

      {/* New affiliate form */}
      {showNew && (
        <NewAffiliateForm
          onCreated={() => { setShowNew(false); load(); }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {loading && <div style={muted}>Cargando…</div>}
      {!loading && error && <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>}
      {!loading && !error && affiliates.length === 0 && (
        <div style={muted}>Sin afiliados registrados. Usa "+ Nuevo afiliado" para añadir o configura el webhook en BixGrow.</div>
      )}

      {/* Totals */}
      {affiliates.length > 0 && (
        <div style={totalsRow}>
          <div style={totalChip}><span style={totalVal}>{affiliates.length}</span><span style={totalLabel}>afiliados</span></div>
          <div style={totalChip}><span style={totalVal}>{totals.clients}</span><span style={totalLabel}>clientes</span></div>
          <div style={totalChip}><span style={totalVal}>{fmt(totals.sales)} €</span><span style={totalLabel}>ventas</span></div>
          <div style={totalChip}><span style={totalVal}>{fmt(totals.commission)} €</span><span style={totalLabel}>comisiones</span></div>
          <div style={{ ...totalChip, ...(totals.pending > 0 ? { background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)" } : {}) }}>
            <span style={{ ...totalVal, ...(totals.pending > 0 ? { color: "#92400e" } : {}) }}>{fmt(totals.pending)} €</span>
            <span style={totalLabel}>pendiente</span>
          </div>
        </div>
      )}

      {/* Affiliate list */}
      {!loading && !error && affiliates.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {affiliates.map((aff) => (
            <AffiliateCard key={aff.id} aff={aff} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.28)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251,246,236,0.78)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const eyebrow: React.CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7, fontWeight: 700 };
const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700 };
const muted: React.CSSProperties = { fontSize: 12, opacity: 0.72 };

const totalsRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const totalChip: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "5px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.07)", background: "rgba(255,255,255,0.55)" };
const totalVal: React.CSSProperties = { fontSize: 13, fontWeight: 700, lineHeight: 1.1 };
const totalLabel: React.CSSProperties = { fontSize: 10, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.05em" };

const affCard: React.CSSProperties = { border: "1px solid rgba(0,0,0,0.07)", borderRadius: 12, background: "rgba(255,255,255,0.66)", overflow: "hidden" };
const affHeader: React.CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", cursor: "pointer", userSelect: "none" };
const affName: React.CSSProperties = { fontSize: 13, fontWeight: 700 };
const affMeta: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, opacity: 0.7, marginTop: 2 };
const expandBody: React.CSSProperties = { borderTop: "1px solid rgba(0,0,0,0.05)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 12 };

const statsGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 };
const statCellStyle: React.CSSProperties = { background: "rgba(0,0,0,0.03)", borderRadius: 8, padding: "5px 8px" };
const statValStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, lineHeight: 1.1 };
const statLabelStyle: React.CSSProperties = { fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em" };

const section: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", opacity: 0.65, marginBottom: 2 };

const clientRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 8, background: "rgba(0,0,0,0.025)" };
const miniPill: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" };
const iconBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.55, padding: "0 4px", lineHeight: 1, flexShrink: 0 };

const searchInput: React.CSSProperties = { width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" };
const dropdown: React.CSSProperties = { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#fff", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto" };
const dropdownItem: React.CSSProperties = { padding: "8px 12px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.04)" };

const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 };
const fieldLabel: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 600, opacity: 0.8 };
const fieldInput: React.CSSProperties = { fontSize: 12, padding: "6px 8px", borderRadius: 7, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(255,255,255,0.9)", outline: "none" };

const newFormCard: React.CSSProperties = { border: "1px solid rgba(199,174,106,0.4)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.6)", display: "flex", flexDirection: "column", gap: 10 };

const btnPrimary: React.CSSProperties = { fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", cursor: "pointer" };
const btnSecondary: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(255,255,255,0.8)", cursor: "pointer", color: "#374151" };
