"use client";

import { useEffect, useMemo, useState } from "react";

type OrderMonitorItem = {
  id: string;
  order_number: string | null;
  client_name: string | null;
  actor_name: string | null;
  status: string | null;
  created_at: string | null;
  expected_delivery_date: string | null;
  amount: number | null;
  currency: string | null;
  is_delayed: boolean;
  is_blocked: boolean;
};

type OrdersMonitorResponse = {
  ok: boolean;
  summary?: {
    open: number;
    delayed: number;
    blocked: number;
  };
  items?: OrderMonitorItem[];
  error?: string;
};

export default function OrdersMonitorBlock() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    open: 0,
    delayed: 0,
    blocked: 0,
  });
  const [items, setItems] = useState<OrderMonitorItem[]>([]);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/control-room/orders-monitor", {
        cache: "no-store",
      });

      const json: OrdersMonitorResponse = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "error loading orders monitor");
      }

      setSummary(
        json.summary || {
          open: 0,
          delayed: 0,
          blocked: 0,
        },
      );

      setItems(json.items || []);
    } catch (err: any) {
      setError(err?.message || "error loading orders monitor");
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
    if (summary.blocked > 0) return "red";
    if (summary.delayed > 0) return "yellow";
    return "green";
  }, [summary.blocked, summary.delayed]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>PEDIDOS</div>
          <StatusBadge status="green" label="LOADING" />
        </div>

        <div style={miniGridStyle}>
          <MiniMetric label="Abiertos" value="—" />
          <MiniMetric label="Retrasados" value="—" />
          <MiniMetric label="Bloqueados" value="—" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>PEDIDOS</div>
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
        <div style={titleStyle}>PEDIDOS</div>
        <StatusBadge status={status} label={statusLabel(status)} />
      </div>

      <div style={miniGridStyle}>
        <MiniMetric label="Abiertos" value={String(summary.open)} />
        <MiniMetric label="Retrasados" value={String(summary.delayed)} />
        <MiniMetric label="Bloqueados" value={String(summary.blocked)} />
      </div>

      <div style={listBlockStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>Sin pedidos pendientes de entrega.</div>
        ) : (
          items.slice(0, 5).map((item) => (
            <OrderRow key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function OrderRow({ item }: { item: OrderMonitorItem }) {
  const rowStatus = item.is_blocked
    ? "blocked"
    : item.is_delayed
      ? "delayed"
      : "normal";

  return (
    <div style={rowStyle}>
      <div style={rowTopStyle}>
        <div style={rowLeftStyle}>
          <div style={orderNumberStyle}>
            {item.order_number || "Pedido sin número"}
          </div>

          <div style={clientStyle}>
            {item.client_name || "Cliente sin nombre"}
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
          <strong>Status:</strong> {item.status || "—"}
        </span>
      </div>

      <div style={metaRowStyle}>
        <span style={metaItemStyle}>
          <strong>Creado:</strong> {formatDate(item.created_at)}
        </span>

        <span style={metaItemStyle}>
          <strong>Entrega:</strong> {formatDate(item.expected_delivery_date)}
        </span>

        <span style={metaItemStyle}>
          <strong>Importe:</strong> {formatAmount(item.amount, item.currency)}
        </span>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={miniMetricStyle}>
      <div style={miniMetricValueStyle}>{value}</div>
      <div style={miniMetricLabelStyle}>{label}</div>
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

function rowStatusColor(status: "normal" | "delayed" | "blocked") {
  if (status === "blocked") return "#dc2626";
  if (status === "delayed") return "#ca8a04";
  return "#2563eb";
}

function rowStatusLabel(status: "normal" | "delayed" | "blocked") {
  if (status === "blocked") return "Bloqueado";
  if (status === "delayed") return "Retrasado";
  return "Activo";
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("es-ES");
}

function formatAmount(amount: number | null, currency: string | null) {
  if (amount == null) return "—";

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency || "EUR"}`;
  }
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
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 12,
};

const miniMetricStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  background: "var(--viho-background)",
  padding: 10,
};

const miniMetricValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1.1,
};

const miniMetricLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
  marginTop: 4,
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

const orderNumberStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.2,
};

const clientStyle: React.CSSProperties = {
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

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#16a34a",
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#dc2626",
};