"use client";

import { useEffect, useState } from "react";

type ActivityItem = {
  id: string;
  timestamp: string | null;
  actor_name: string | null;
  action_type: string;
  entity_type: string | null;
  entity_label: string | null;
  message: string | null;
  severity: "info" | "warning" | "critical";
  amount?: number | null;
};

type ActivityResponse = {
  ok: boolean;
  items?: ActivityItem[];
  summary?: { total_events: number; invoices: number; assignments: number; warnings: number };
  error?: string;
};

function fmtTime(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function severityDot(sev: string): React.CSSProperties {
  if (sev === "critical") return { background: "#dc2626" };
  if (sev === "warning") return { background: "#d97706" };
  return { background: "#3b82f6" };
}

function actionLabel(type: string): string {
  const map: Record<string, string> = {
    factura_creada: "Creada",
    factura_revisada: "Revisada",
    pendiente_revision: "Pendiente revisión",
    asignacion: "Asignación",
    aviso_tecnico: "Aviso técnico",
    invoice_created: "Creada",
    invoice_reviewed: "Revisada",
    invoice_needs_review: "Pendiente revisión",
    assignment: "Asignación",
    technical_warning: "Aviso técnico",
  };
  return map[type] ?? type;
}

export default function ActivityTimelineBlock() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [summary, setSummary] = useState<ActivityResponse["summary"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const res = await fetch("/api/control-room/activity", { cache: "no-store" });
      const json: ActivityResponse = await res.json();
      if (!json.ok) throw new Error(json.error || "Error cargando actividad");
      setItems(json.items || []);
      setSummary(json.summary ?? null);
    } catch (e: any) {
      setError(e?.message || "Error cargando actividad");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={card}>
      <div style={header}>
        <div>
          <div style={eyebrow}>Trazabilidad</div>
          <div style={title}>Actividad Reciente</div>
        </div>
        {summary && (
          <div style={summaryChips}>
            <span style={chip}>{summary.total_events} eventos</span>
            <span style={chip}>{summary.invoices} facturas</span>
            <span style={chip}>{summary.assignments} asignaciones</span>
            {summary.warnings > 0 && <span style={{ ...chip, color: "#92400e", background: "rgba(217,119,6,0.1)" }}>{summary.warnings} avisos</span>}
          </div>
        )}
      </div>

      {loading && <div style={muted}>Cargando…</div>}
      {!loading && error && <div style={errorText}>{error}</div>}
      {!loading && !error && items.length === 0 && <div style={muted}>Sin actividad reciente.</div>}

      {!loading && !error && items.length > 0 && (
        <div style={timeline}>
          {items.slice(0, 20).map((item) => {
            const text = item.message || item.entity_label || `${item.entity_type || "Sistema"} — ${item.action_type}`;
            return (
              <div key={item.id} style={row}>
                <div style={{ ...dot, ...severityDot(item.severity) }} />
                <div style={rowTime}>{fmtDate(item.timestamp)}</div>
                <div style={badge}>{actionLabel(item.action_type)}</div>
                <div style={rowMsg}>{text}</div>
                {item.amount != null && item.amount > 0 && (
                  <div style={amountTag}>{fmtMoney(item.amount)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.28)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251,246,236,0.78)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  width: "100%",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  flexWrap: "wrap",
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
};

const summaryChips: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chip: React.CSSProperties = {
  fontSize: 10,
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  fontWeight: 600,
};

const muted: React.CSSProperties = { fontSize: 12, opacity: 0.72 };
const errorText: React.CSSProperties = { fontSize: 12, color: "#b91c1c" };

const timeline: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
  borderBottom: "1px solid rgba(0,0,0,0.04)",
  flexWrap: "wrap",
};

const dot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  flexShrink: 0,
};

const rowTime: React.CSSProperties = {
  fontSize: 11,
  width: 72,
  flexShrink: 0,
  opacity: 0.65,
  fontVariantNumeric: "tabular-nums",
};

const badge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.07)",
  flexShrink: 0,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const rowMsg: React.CSSProperties = {
  fontSize: 12,
  flex: 1,
  minWidth: 100,
};

const amountTag: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
  color: "#374151",
};
