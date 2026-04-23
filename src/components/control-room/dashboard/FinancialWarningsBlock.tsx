"use client";

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertItem = {
  id: string;
  type: "critical" | "warning" | "info";
  message: string;
};

type OrphanClient = {
  id: string;
  name: string | null;
  holded_contact_id: string | null;
  open_invoices_count: number;
  pending_amount: number;
};

type DelegateOption = {
  id: string;
  name: string | null;
  email: string | null;
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchAlerts(): Promise<AlertItem[]> {
  try {
    const res = await fetch("/api/control-room/alerts", { cache: "no-store" });
    const j = await res.json();
    return Array.isArray(j.alerts) ? j.alerts : [];
  } catch {
    return [];
  }
}

async function fetchOrphanClients(): Promise<OrphanClient[]> {
  try {
    const res = await fetch("/api/control-room/clients-monitor", { cache: "no-store" });
    const j = await res.json();
    if (!j.ok) return [];
    const items: any[] = Array.isArray(j.items) ? j.items : [];
    return items
      .filter((c) => c.orphan_client === true)
      .map((c) => ({
        id: c.id,
        name: c.name ?? null,
        holded_contact_id: c.holded_contact_id ?? null,
        open_invoices_count: c.open_invoices_count ?? 0,
        pending_amount: c.pending_amount ?? 0,
      }));
  } catch {
    return [];
  }
}

async function fetchDelegates(): Promise<DelegateOption[]> {
  try {
    const res = await fetch("/api/control-room/el-elyon/client-assignments", { cache: "no-store" });
    const j = await res.json();
    const delegates: any[] = Array.isArray(j.dictionaries?.delegates)
      ? j.dictionaries.delegates
      : [];
    return delegates.map((d) => ({ id: d.id, name: d.name ?? null, email: d.email ?? null }));
  } catch {
    return [];
  }
}

async function assignDelegate(clientHoldedContactId: string, actorId: string): Promise<void> {
  const res = await fetch("/api/control-room/el-elyon/client-assignments/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientHoldedContactId, assignmentRole: "delegate", actorId }),
  });
  const j = await res.json().catch(() => null);
  if (!j?.ok) throw new Error(j?.error ?? "Error al asignar delegado");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.65, marginBottom: 8 }}>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert rows
// ---------------------------------------------------------------------------

function AlertRow({ alert }: { alert: AlertItem }) {
  const color = alert.type === "critical" ? "#dc2626" : alert.type === "warning" ? "#d97706" : "#2563eb";
  const icon = alert.type === "critical" ? "⛔" : alert.type === "warning" ? "⚠️" : "ℹ️";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 10px", borderRadius: 10, background: `${color}0D`, border: `1px solid ${color}33` }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, color, lineHeight: 1.45 }}>{alert.message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orphan client row with inline assignment
// ---------------------------------------------------------------------------

function OrphanRow({
  client,
  delegates,
  onAssigned,
}: {
  client: OrphanClient;
  delegates: DelegateOption[];
  onAssigned: (clientId: string) => void;
}) {
  const [selectedActorId, setSelectedActorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign() {
    if (!selectedActorId || !client.holded_contact_id) return;
    setSaving(true);
    setError(null);
    try {
      await assignDelegate(client.holded_contact_id, selectedActorId);
      onAssigned(client.id);
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: "1px solid #fde68a", borderRadius: 10, padding: 10, background: "#fffbeb", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>{client.name ?? "Cliente sin nombre"}</div>
          <div style={{ fontSize: 11, color: "#a16207", marginTop: 2 }}>
            {client.open_invoices_count > 0 && `${client.open_invoices_count} facturas · ${fmtCurrency(client.pending_amount)}`}
            {client.open_invoices_count === 0 && "Sin facturas abiertas"}
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#dc2626", borderRadius: 999, padding: "3px 7px" }}>
          Sin delegado
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          value={selectedActorId}
          onChange={(e) => setSelectedActorId(e.target.value)}
          disabled={saving || delegates.length === 0}
          style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 8, border: "1px solid #d6c28a", background: "#fffff8", color: "#3d2c0f", minWidth: 0 }}
        >
          <option value="">— Asignar delegado —</option>
          {delegates.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name ?? d.email ?? d.id}
            </option>
          ))}
        </select>
        <button
          onClick={handleAssign}
          disabled={!selectedActorId || saving || !client.holded_contact_id}
          style={{
            fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
            background: selectedActorId && !saving ? "#C7822A" : "#e5e7eb",
            color: selectedActorId && !saving ? "#fff" : "#9ca3af",
            border: "none", cursor: selectedActorId && !saving ? "pointer" : "default",
            whiteSpace: "nowrap", flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          {saving ? "Guardando…" : "Asignar"}
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main block
// ---------------------------------------------------------------------------

export default function FinancialWarningsBlock() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [orphans, setOrphans] = useState<OrphanClient[]>([]);
  const [delegates, setDelegates] = useState<DelegateOption[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingOrphans, setLoadingOrphans] = useState(true);

  const load = useCallback(async () => {
    setLoadingAlerts(true);
    setLoadingOrphans(true);
    const [alertData, orphanData, delegateData] = await Promise.all([
      fetchAlerts(),
      fetchOrphanClients(),
      fetchDelegates(),
    ]);
    setAlerts(alertData);
    setOrphans(orphanData);
    setDelegates(delegateData);
    setLoadingAlerts(false);
    setLoadingOrphans(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const critical = alerts.filter((a) => a.type === "critical");
  const warnings = alerts.filter((a) => a.type === "warning");

  function handleAssigned(clientId: string) {
    setOrphans((prev) => prev.filter((c) => c.id !== clientId));
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={eyebrow}>Avisos financieros</div>
          <div style={title}>Alertas y asignaciones</div>
        </div>
        {(critical.length > 0 || orphans.length > 0) && (
          <div style={{ display: "flex", gap: 6 }}>
            {critical.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#dc2626", borderRadius: 999, padding: "3px 8px" }}>
                {critical.length} críticas
              </span>
            )}
            {orphans.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#d97706", borderRadius: 999, padding: "3px 8px" }}>
                {orphans.length} sin asignar
              </span>
            )}
          </div>
        )}
      </div>

      {/* ALERTAS */}
      <SectionTitle label="Centro de alertas" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {loadingAlerts && <span style={muted}>Cargando alertas…</span>}
        {!loadingAlerts && alerts.length === 0 && (
          <div style={{ fontSize: 12, color: "#16a34a" }}>✓ Sin alertas activas</div>
        )}
        {!loadingAlerts && [...critical, ...warnings].map((a) => (
          <AlertRow key={a.id} alert={a} />
        ))}
      </div>

      {/* ASIGNACIONES */}
      <SectionTitle label="Asignaciones pendientes" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loadingOrphans && <span style={muted}>Cargando clientes…</span>}
        {!loadingOrphans && orphans.length === 0 && (
          <div style={{ fontSize: 12, color: "#16a34a" }}>✓ Todos los clientes tienen delegado</div>
        )}
        {!loadingOrphans && orphans.map((c) => (
          <OrphanRow key={c.id} client={c} delegates={delegates} onAssigned={handleAssigned} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.35)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(251,246,236,0.85)",
  minHeight: 180,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.65,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.2,
  marginTop: 2,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
};
