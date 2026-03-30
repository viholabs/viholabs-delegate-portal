"use client";

import { useEffect, useMemo, useState } from "react";

type ClientMonitorItem = {
  id: string;
  name: string | null;
  created_at: string | null;
  actor_name: string | null;
  recommender_name: string | null;
  status: string | null;
  has_actor: boolean;
  needs_validation: boolean;
  has_warning: boolean;
  warning_label: string | null;
};

type ClientsMonitorResponse = {
  ok: boolean;
  summary?: {
    new_clients: number;
    without_actor: number;
    warnings: number;
    pending_validation: number;
  };
  items?: ClientMonitorItem[];
  error?: string;
};

export default function ClientsMonitorBlock() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    new_clients: 0,
    without_actor: 0,
    warnings: 0,
    pending_validation: 0,
  });
  const [items, setItems] = useState<ClientMonitorItem[]>([]);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/control-room/clients-monitor", {
        cache: "no-store",
      });

      const json: ClientsMonitorResponse = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "error loading clients monitor");
      }

      setSummary(
        json.summary || {
          new_clients: 0,
          without_actor: 0,
          warnings: 0,
          pending_validation: 0,
        },
      );

      setItems(json.items || []);
    } catch (err: any) {
      setError(err?.message || "error loading clients monitor");
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
    if (summary.without_actor > 0) return "red";
    if (summary.warnings > 0 || summary.pending_validation > 0) return "yellow";
    return "green";
  }, [summary.without_actor, summary.warnings, summary.pending_validation]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>CLIENTES</div>
          <StatusBadge status="green" label="LOADING" />
        </div>

        <div style={miniGridStyle}>
          <MetricCard label="Nuevos" value="—" />
          <MetricCard label="Sin actor" value="—" />
          <MetricCard label="Warnings" value="—" />
          <MetricCard label="Validación" value="—" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>CLIENTES</div>
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
        <div style={titleStyle}>CLIENTES</div>
        <StatusBadge status={status} label={statusLabel(status)} />
      </div>

      <div style={miniGridStyle}>
        <MetricCard label="Nuevos" value={String(summary.new_clients)} />
        <MetricCard
          label="Sin actor"
          value={String(summary.without_actor)}
          tone={summary.without_actor > 0 ? "red" : "neutral"}
        />
        <MetricCard
          label="Warnings"
          value={String(summary.warnings)}
          tone={summary.warnings > 0 ? "yellow" : "neutral"}
        />
        <MetricCard
          label="Validación"
          value={String(summary.pending_validation)}
          tone={summary.pending_validation > 0 ? "yellow" : "neutral"}
        />
      </div>

      <div style={listBlockStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>Sin clientes sensibles ahora mismo.</div>
        ) : (
          items.slice(0, 5).map((item) => (
            <ClientRow key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function ClientRow({ item }: { item: ClientMonitorItem }) {
  const rowStatus = !item.has_actor
    ? "missing_actor"
    : item.has_warning
      ? "warning"
      : item.needs_validation
        ? "validation"
        : "ok";

  return (
    <div style={rowStyle}>
      <div style={rowTopStyle}>
        <div style={rowLeftStyle}>
          <div style={clientNameStyle}>{item.name || "Cliente sin nombre"}</div>

          <div style={clientSubStyle}>
            Alta: {formatDate(item.created_at)}
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
          <strong>Actor:</strong> {item.actor_name || "—"}
        </span>

        <span style={metaItemStyle}>
          <strong>Recomendador:</strong> {item.recommender_name || "—"}
        </span>

        <span style={metaItemStyle}>
          <strong>Status:</strong> {item.status || "—"}
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
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "yellow" | "red";
}) {
  return (
    <div
      style={{
        ...metricCardStyle,
        borderColor: metricBorderColor(tone),
      }}
    >
      <div style={metricValueStyle}>{value}</div>
      <div style={metricLabelStyle}>{label}</div>
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

function metricBorderColor(tone: "neutral" | "yellow" | "red") {
  if (tone === "yellow") return "#ca8a04";
  if (tone === "red") return "#dc2626";
  return "var(--viho-border)";
}

function rowStatusColor(
  status: "missing_actor" | "warning" | "validation" | "ok",
) {
  if (status === "missing_actor") return "#dc2626";
  if (status === "warning") return "#ca8a04";
  if (status === "validation") return "#2563eb";
  return "#16a34a";
}

function rowStatusLabel(
  status: "missing_actor" | "warning" | "validation" | "ok",
) {
  if (status === "missing_actor") return "Sin actor";
  if (status === "warning") return "Warning";
  if (status === "validation") return "Validar";
  return "OK";
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("es-ES");
}

/* ---------------- styles ---------------- */

const containerStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 12,
  background: "var(--viho-surface)",
  padding: 14,
  marginBottom: 18,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const statusBadgeStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: "4px 8px",
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const miniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 12,
};

const metricCardStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  background: "var(--viho-background)",
  padding: 10,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1.1,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
  marginTop: 3,
};

const listBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  background: "var(--viho-background)",
  padding: 10,
};

const rowTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 6,
};

const rowLeftStyle: React.CSSProperties = {
  minWidth: 0,
};

const rowRightStyle: React.CSSProperties = {
  flexShrink: 0,
};

const rowBadgeStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: "4px 8px",
  lineHeight: 1,
};

const clientNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.2,
};

const clientSubStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
  marginTop: 2,
  lineHeight: 1.2,
};

const metaRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 4,
};

const metaItemStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
  lineHeight: 1.25,
};

const warningTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#ca8a04",
  marginTop: 6,
  lineHeight: 1.25,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#16a34a",
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#dc2626",
};