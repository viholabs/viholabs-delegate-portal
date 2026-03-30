"use client";

import { useEffect, useMemo, useState } from "react";

type ActorMonitorItem = {
  actor_id: string;
  name: string | null;
  role: string | null;
  status: string | null;
  sales_month: number;
  clients_assigned: number;
  pending_invoices: number;
  has_warning: boolean;
  warning_label: string | null;
};

type ActorsMonitorResponse = {
  ok: boolean;
  summary?: {
    active: number;
    warnings: number;
    inactive: number;
    top_actor_name: string | null;
    top_actor_sales: number;
  };
  items?: ActorMonitorItem[];
  error?: string;
};

export default function ActorsMonitorBlock() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    active: 0,
    warnings: 0,
    inactive: 0,
    top_actor_name: null as string | null,
    top_actor_sales: 0,
  });
  const [items, setItems] = useState<ActorMonitorItem[]>([]);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/control-room/actors-monitor", {
        cache: "no-store",
      });

      const json: ActorsMonitorResponse = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "error loading actors monitor");
      }

      setSummary(
        json.summary || {
          active: 0,
          warnings: 0,
          inactive: 0,
          top_actor_name: null,
          top_actor_sales: 0,
        },
      );

      setItems(json.items || []);
    } catch (err: any) {
      setError(err?.message || "error loading actors monitor");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const interval = setInterval(() => {
      load();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const status = useMemo<"green" | "yellow" | "red">(() => {
    if (summary.warnings > 2) return "red";
    if (summary.warnings > 0) return "yellow";
    return "green";
  }, [summary.warnings]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>ACTORES</div>
          <StatusBadge status="green" label="LOADING" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>ACTORES</div>
          <StatusBadge status="red" label="ERROR" />
        </div>

        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...containerStyle,
        borderColor: statusColor(status),
      }}
    >
      <div style={headerRowStyle}>
        <div style={titleStyle}>ACTORES</div>
        <StatusBadge status={status} label={statusLabel(status)} />
      </div>

      <div style={miniGridStyle}>
        <MetricCard label="Activos" value={String(summary.active)} />
        <MetricCard
          label="Warnings"
          value={String(summary.warnings)}
          tone={summary.warnings > 0 ? "yellow" : "neutral"}
        />
        <MetricCard label="Inactivos" value={String(summary.inactive)} />
        <MetricCard
          label="Top actor"
          value={summary.top_actor_name || "—"}
          sub={formatMoney(summary.top_actor_sales)}
        />
      </div>

      <div style={listBlockStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>Sin incidencias de actores.</div>
        ) : (
          items.slice(0, 5).map((item) => (
            <ActorRow key={item.actor_id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function ActorRow({ item }: { item: ActorMonitorItem }) {
  const rowStatus = item.has_warning ? "warning" : "ok";

  return (
    <div style={rowStyle}>
      <div style={rowTopStyle}>
        <div style={rowLeftStyle}>
          <div style={actorNameStyle}>{item.name || "Actor sin nombre"}</div>

          <div style={actorSubStyle}>
            {item.role || "Rol desconocido"}
          </div>
        </div>

        <div style={rowRightStyle}>
          <div
            style={{
              ...rowBadgeStyle,
              background: rowStatusColor(rowStatus),
            }}
          >
            {rowStatusLabel(rowStatus)}
          </div>
        </div>
      </div>

      <div style={metaRowStyle}>
        <span style={metaItemStyle}>
          <strong>Ventas mes:</strong> {formatMoney(item.sales_month)}
        </span>

        <span style={metaItemStyle}>
          <strong>Clientes:</strong> {item.clients_assigned}
        </span>

        <span style={metaItemStyle}>
          <strong>Facturas pendientes:</strong> {item.pending_invoices}
        </span>
      </div>

      {item.warning_label && (
        <div style={warningTextStyle}>
          <strong>Warning:</strong> {item.warning_label}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "yellow";
}) {
  return (
    <div
      style={{
        ...metricCardStyle,
        borderColor: tone === "yellow" ? "#ca8a04" : "var(--viho-border)",
      }}
    >
      <div style={metricValueStyle}>{value}</div>
      <div style={metricLabelStyle}>{label}</div>
      {sub && <div style={metricSubStyle}>{sub}</div>}
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: "green" | "yellow" | "red";
  label: string;
}) {
  return (
    <div
      style={{
        ...statusBadgeStyle,
        background: statusColor(status),
      }}
    >
      {label}
    </div>
  );
}

function statusColor(status: "green" | "yellow" | "red") {
  if (status === "green") return "#16a34a";
  if (status === "yellow") return "#ca8a04";
  return "#dc2626";
}

function statusLabel(status: "green" | "yellow" | "red") {
  if (status === "green") return "CONTROLADO";
  if (status === "yellow") return "ATENCIÓN";
  return "CRÍTICO";
}

function rowStatusColor(status: "ok" | "warning") {
  return status === "warning" ? "#ca8a04" : "#16a34a";
}

function rowStatusLabel(status: "ok" | "warning") {
  return status === "warning" ? "Warning" : "OK";
}

function formatMoney(amount: number) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(amount || 0);
  } catch {
    return `${amount || 0} €`;
  }
}

/* styles */

const containerStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 12,
  background: "var(--viho-surface)",
  padding: 14,
  marginBottom: 18,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 10,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const statusBadgeStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 10,
  padding: "4px 8px",
  borderRadius: 999,
};

const miniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4,1fr)",
  gap: 8,
  marginBottom: 12,
};

const metricCardStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  padding: 10,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
};

const metricSubStyle: React.CSSProperties = {
  fontSize: 10,
};

const listBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  padding: 10,
};

const rowTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
};

const rowLeftStyle: React.CSSProperties = {};

const rowRightStyle: React.CSSProperties = {};

const rowBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "3px 6px",
  borderRadius: 999,
  color: "#fff",
};

const actorNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
};

const actorSubStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
};

const metaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginTop: 4,
};

const metaItemStyle: React.CSSProperties = {
  fontSize: 11,
};

const warningTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#ca8a04",
  marginTop: 6,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#16a34a",
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#dc2626",
};