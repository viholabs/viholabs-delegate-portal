"use client";

import { useEffect, useState } from "react";

type AlertItem = {
  id: string;
  type: "critical" | "warning" | "info";
  message: string;
};

type InvoiceAtRisk = {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  delegate_name: string | null;
  total_net: number;
  days_overdue: number;
};

type AlertResponse = {
  ok: boolean;
  alerts: AlertItem[];
  invoices_at_risk?: InvoiceAtRisk[];
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default function AlertCenterBlock() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceAtRisk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/control-room/alerts", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: AlertResponse) => {
        if (!json.ok) throw new Error("error loading alerts");
        setAlerts(json.alerts || []);
        setInvoices(json.invoices_at_risk || []);
      })
      .catch((e: any) => setError(e.message));
  }, []);

  const critical = alerts.filter((a) => a.type === "critical");
  const warning = alerts.filter((a) => a.type === "warning");

  return (
    <div style={card}>
      <div style={eyebrow}>Alertas</div>
      <div style={titleRow}>
        <div style={title}>Centro de Alertas</div>
        {(critical.length > 0 || warning.length > 0) && (
          <div style={pills}>
            {critical.length > 0 && <span style={{ ...pill, background: "rgba(220,38,38,0.12)", color: "#b91c1c" }}>{critical.length} críticas</span>}
            {warning.length > 0 && <span style={{ ...pill, background: "rgba(202,138,4,0.12)", color: "#92400e" }}>{warning.length} avisos</span>}
          </div>
        )}
      </div>

      {error && <div style={errorText}>{error}</div>}

      {!error && alerts.length === 0 && (
        <div style={muted}>✓ Sin alertas activas</div>
      )}

      {!error && alerts.length > 0 && (
        <div style={list}>
          {alerts.map((alert) => (
            <div key={alert.id} style={alertRow}>
              <span style={icon(alert.type)}>
                {alert.type === "critical" ? "⛔" : alert.type === "warning" ? "⚠" : "ℹ"}
              </span>
              <span style={msgText}>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {invoices.length > 0 && (
        <div>
          <button
            style={toggleBtn}
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? "▲ Ocultar facturas" : `▼ Ver ${invoices.length} factura${invoices.length > 1 ? "s" : ""} crítica${invoices.length > 1 ? "s" : ""}`}
          </button>

          {expanded && (
            <div style={invoiceTable}>
              <div style={tableHeader}>
                <span style={{ flex: 1 }}>Nº Factura</span>
                <span style={{ flex: 2 }}>Cliente</span>
                <span style={{ flex: 2 }}>Delegado</span>
                <span style={{ width: 60, textAlign: "right" }}>Días</span>
                <span style={{ width: 80, textAlign: "right" }}>Importe</span>
              </div>
              {invoices.map((inv) => (
                <div key={inv.id} style={tableRow}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{inv.invoice_number || "—"}</span>
                  <span style={{ flex: 2 }}>{inv.client_name || "—"}</span>
                  <span style={{ flex: 2, opacity: 0.75 }}>{inv.delegate_name || "—"}</span>
                  <span style={{ width: 60, textAlign: "right", color: inv.days_overdue > 30 ? "#b91c1c" : "#92400e" }}>
                    {inv.days_overdue}d
                  </span>
                  <span style={{ width: 80, textAlign: "right", fontWeight: 600 }}>{fmt(inv.total_net)}</span>
                </div>
              ))}
            </div>
          )}
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
  gap: 8,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
  fontWeight: 700,
};

const titleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
};

const pills: React.CSSProperties = {
  display: "flex",
  gap: 6,
};

const pill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const muted: React.CSSProperties = { fontSize: 12, opacity: 0.72 };
const errorText: React.CSSProperties = { fontSize: 12, color: "#b91c1c" };

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const alertRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
  fontSize: 12,
};

function icon(type: "critical" | "warning" | "info"): React.CSSProperties {
  return { flexShrink: 0, marginTop: 1 };
}

const msgText: React.CSSProperties = { lineHeight: 1.4 };

const toggleBtn: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#374151",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px 0",
  textDecoration: "underline",
  opacity: 0.75,
};

const invoiceTable: React.CSSProperties = {
  marginTop: 6,
  border: "1px solid rgba(0,0,0,0.07)",
  borderRadius: 10,
  overflow: "hidden",
  fontSize: 11,
};

const tableHeader: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "6px 10px",
  background: "rgba(0,0,0,0.04)",
  fontWeight: 700,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  opacity: 0.7,
};

const tableRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "7px 10px",
  borderTop: "1px solid rgba(0,0,0,0.05)",
  background: "rgba(255,255,255,0.55)",
};
