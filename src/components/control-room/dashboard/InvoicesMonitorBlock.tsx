"use client";

import { useEffect, useMemo, useState } from "react";

type InvoiceMonitorItem = {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  delegate_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  days_overdue: number;
  is_overdue: boolean;
  is_critical: boolean;
};

type InvoicesMonitorResponse = {
  ok: boolean;
  summary?: {
    pending_count: number;
    pending_amount: number;
    overdue_count: number;
    overdue_amount: number;
    critical_count: number;
    critical_amount: number;
  };
  items?: InvoiceMonitorItem[];
  error?: string;
};

export default function InvoicesMonitorBlock() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    pending_count: 0,
    pending_amount: 0,
    overdue_count: 0,
    overdue_amount: 0,
    critical_count: 0,
    critical_amount: 0,
  });
  const [items, setItems] = useState<InvoiceMonitorItem[]>([]);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/control-room/invoices-monitor", {
        cache: "no-store",
      });

      const json: InvoicesMonitorResponse = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "error loading invoices monitor");
      }

      setSummary(
        json.summary || {
          pending_count: 0,
          pending_amount: 0,
          overdue_count: 0,
          overdue_amount: 0,
          critical_count: 0,
          critical_amount: 0,
        },
      );

      setItems(json.items || []);
    } catch (err: any) {
      setError(err?.message || "error loading invoices monitor");
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
    if (summary.critical_count > 0) return "red";
    if (summary.overdue_count > 0) return "yellow";
    return "green";
  }, [summary.critical_count, summary.overdue_count]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>FACTURAS</div>
          <StatusBadge status="green" label="LOADING" />
        </div>

        <div style={miniGridStyle}>
          <MetricCard label="Pendientes" value="—" sub="—" />
          <MetricCard label="Vencidas" value="—" sub="—" />
          <MetricCard label="Críticas" value="—" sub="—" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>FACTURAS</div>
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
        <div style={titleStyle}>FACTURAS</div>
        <StatusBadge status={status} label={statusLabel(status)} />
      </div>

      <div style={miniGridStyle}>
        <MetricCard
          label="Pendientes"
          value={String(summary.pending_count)}
          sub={formatMoney(summary.pending_amount)}
        />

        <MetricCard
          label="Vencidas"
          value={String(summary.overdue_count)}
          sub={formatMoney(summary.overdue_amount)}
          tone={summary.overdue_count > 0 ? "yellow" : "neutral"}
        />

        <MetricCard
          label="Críticas >15d"
          value={String(summary.critical_count)}
          sub={formatMoney(summary.critical_amount)}
          tone={summary.critical_count > 0 ? "red" : "neutral"}
        />
      </div>

      <div style={listBlockStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>Sin facturas de riesgo ahora mismo.</div>
        ) : (
          items.slice(0, 5).map((item) => (
            <InvoiceRow key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function InvoiceRow({ item }: { item: InvoiceMonitorItem }) {
  const rowStatus = item.is_critical
    ? "critical"
    : item.is_overdue
      ? "overdue"
      : "pending";

  return (
    <div style={rowStyle}>
      <div style={rowTopStyle}>
        <div style={rowLeftStyle}>
          <div style={invoiceNumberStyle}>
            {item.invoice_number || "Factura sin número"}
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
          <strong>Delegado:</strong> {item.delegate_name || "—"}
        </span>

        <span style={metaItemStyle}>
          <strong>Status:</strong> {item.status || "—"}
        </span>
      </div>

      <div style={metaRowStyle}>
        <span style={metaItemStyle}>
          <strong>Emisión:</strong> {formatDate(item.issue_date)}
        </span>

        <span style={metaItemStyle}>
          <strong>Vencimiento:</strong> {formatDate(item.due_date)}
        </span>

        <span style={metaItemStyle}>
          <strong>Importe:</strong> {formatAmount(item.amount, item.currency)}
        </span>

        <span style={metaItemStyle}>
          <strong>Días:</strong> {item.days_overdue > 0 ? item.days_overdue : 0}
        </span>
      </div>
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
  sub: string;
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
      <div style={metricSubStyle}>{sub}</div>
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

function rowStatusColor(status: "pending" | "overdue" | "critical") {
  if (status === "critical") return "#dc2626";
  if (status === "overdue") return "#ca8a04";
  return "#2563eb";
}

function rowStatusLabel(status: "pending" | "overdue" | "critical") {
  if (status === "critical") return "Crítica";
  if (status === "overdue") return "Vencida";
  return "Pendiente";
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

function formatMoney(amount: number) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} €`;
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

const metricSubStyle: React.CSSProperties = {
  fontSize: 11,
  marginTop: 4,
  fontWeight: 600,
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

const invoiceNumberStyle: React.CSSProperties = {
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