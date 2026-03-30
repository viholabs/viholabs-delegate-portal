"use client";

import { useEffect, useState } from "react";

type AlertItem = {
  id: string;
  type: "critical" | "warning" | "info";
  message: string;
};

type AlertResponse = {
  ok: boolean;
  alerts: AlertItem[];
};

export default function AlertCenterBlock() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/control-room/alerts", {
        cache: "no-store",
      });

      const json: AlertResponse = await res.json();

      if (!json.ok) {
        throw new Error("error loading alerts");
      }

      setAlerts(json.alerts || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const critical = alerts.filter((a) => a.type === "critical");
  const warning = alerts.filter((a) => a.type === "warning");

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>CENTRO DE ALERTAS</div>

      {error && <div style={{ color: "#dc2626" }}>{error}</div>}

      {!error && alerts.length === 0 && (
        <div style={okStyle}>✓ Sin alertas</div>
      )}

      {!error && alerts.length > 0 && (
        <div style={listStyle}>
          {alerts.slice(0, 5).map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      {(critical.length > 0 || warning.length > 0) && (
        <div style={summaryStyle}>
          {critical.length > 0 && (
            <span style={{ color: "#dc2626" }}>
              {critical.length} críticas
            </span>
          )}

          {warning.length > 0 && (
            <span style={{ color: "#ca8a04" }}>
              {warning.length} warnings
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: AlertItem }) {
  return (
    <div style={rowStyle}>
      <span style={iconStyle(alert.type)}>
        {alert.type === "critical" ? "⛔" : alert.type === "warning" ? "⚠" : "ℹ"}
      </span>

      <span style={messageStyle}>{alert.message}</span>
    </div>
  );
}

function iconStyle(type: AlertItem["type"]): React.CSSProperties {
  if (type === "critical") return { marginRight: 6, color: "#dc2626" };
  if (type === "warning") return { marginRight: 6, color: "#ca8a04" };
  return { marginRight: 6, color: "#2563eb" };
}

/* ---------------- styles ---------------- */

const containerStyle: React.CSSProperties = {
  marginBottom: 18,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 10,
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const rowStyle: React.CSSProperties = {
  fontSize: 12,
  display: "flex",
  alignItems: "center",
};

const messageStyle: React.CSSProperties = {
  fontSize: 12,
};

const summaryStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  display: "flex",
  gap: 12,
};

const okStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#16a34a",
};