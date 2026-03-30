"use client";

import { useEffect, useMemo, useState } from "react";

type TopClientRiskItem = {
  client_id: string;
  client_name: string | null;
  amount: number;
};

type TopDelegateRiskItem = {
  delegate_id: string;
  delegate_name: string | null;
  amount: number;
};

type AgingBucket = {
  label: string;
  count: number;
  amount: number;
};

type CollectionRiskResponse = {
  ok: boolean;
  summary?: {
    total_at_risk: number;
    overdue_15_amount: number;
    overdue_30_amount: number;
    risky_clients_count: number;
    risky_delegates_count: number;
  };
  top_clients?: TopClientRiskItem[];
  top_delegates?: TopDelegateRiskItem[];
  aging_buckets?: AgingBucket[];
  error?: string;
};

export default function CollectionRiskBlock() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    total_at_risk: 0,
    overdue_15_amount: 0,
    overdue_30_amount: 0,
    risky_clients_count: 0,
    risky_delegates_count: 0,
  });
  const [topClients, setTopClients] = useState<TopClientRiskItem[]>([]);
  const [topDelegates, setTopDelegates] = useState<TopDelegateRiskItem[]>([]);
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>([]);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/control-room/collection-risk", {
        cache: "no-store",
      });

      const json: CollectionRiskResponse = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "error loading collection risk");
      }

      setSummary(
        json.summary || {
          total_at_risk: 0,
          overdue_15_amount: 0,
          overdue_30_amount: 0,
          risky_clients_count: 0,
          risky_delegates_count: 0,
        },
      );
      setTopClients(json.top_clients || []);
      setTopDelegates(json.top_delegates || []);
      setAgingBuckets(json.aging_buckets || []);
    } catch (err: any) {
      setError(err?.message || "error loading collection risk");
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
    if (summary.overdue_30_amount > 0) return "red";
    if (summary.total_at_risk > 0) return "yellow";
    return "green";
  }, [summary.overdue_30_amount, summary.total_at_risk]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>RIESGO DE COBRO</div>
          <StatusBadge status="green" label="LOADING" />
        </div>

        <div style={miniGridStyle}>
          <MetricCard label="En riesgo" value="—" sub="—" />
          <MetricCard label=">15 días" value="—" sub="—" />
          <MetricCard label=">30 días" value="—" sub="—" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={titleStyle}>RIESGO DE COBRO</div>
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
        <div style={titleStyle}>RIESGO DE COBRO</div>
        <StatusBadge status={status} label={statusLabel(status)} />
      </div>

      <div style={miniGridStyle}>
        <MetricCard
          label="En riesgo"
          value={formatMoney(summary.total_at_risk)}
          sub={`${summary.risky_clients_count} clientes`}
        />

        <MetricCard
          label=">15 días"
          value={formatMoney(summary.overdue_15_amount)}
          sub={`${summary.risky_delegates_count} delegados`}
          tone={summary.overdue_15_amount > 0 ? "yellow" : "neutral"}
        />

        <MetricCard
          label=">30 días"
          value={formatMoney(summary.overdue_30_amount)}
          sub="crítico"
          tone={summary.overdue_30_amount > 0 ? "red" : "neutral"}
        />
      </div>

      <div style={sectionsGridStyle}>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Top clientes riesgo</div>

          {topClients.length === 0 ? (
            <div style={emptyStyle}>Sin clientes en riesgo.</div>
          ) : (
            topClients.slice(0, 5).map((item, index) => (
              <RiskRow
                key={item.client_id || `${item.client_name}-${index}`}
                label={item.client_name || "Cliente sin nombre"}
                amount={item.amount}
              />
            ))
          )}
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Top delegados riesgo</div>

          {topDelegates.length === 0 ? (
            <div style={emptyStyle}>Sin delegados en riesgo.</div>
          ) : (
            topDelegates.slice(0, 5).map((item, index) => (
              <RiskRow
                key={item.delegate_id || `${item.delegate_name}-${index}`}
                label={item.delegate_name || "Delegado sin nombre"}
                amount={item.amount}
              />
            ))
          )}
        </div>
      </div>

      <div style={agingBlockStyle}>
        <div style={sectionTitleStyle}>Aging buckets</div>

        <div style={agingGridStyle}>
          {(agingBuckets.length > 0
            ? agingBuckets
            : defaultBuckets
          ).map((bucket) => (
            <AgingTile
              key={bucket.label}
              label={bucket.label}
              count={bucket.count}
              amount={bucket.amount}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RiskRow({
  label,
  amount,
}: {
  label: string;
  amount: number;
}) {
  return (
    <div style={riskRowStyle}>
      <div style={riskLabelStyle}>{label}</div>
      <div style={riskAmountStyle}>{formatMoney(amount)}</div>
    </div>
  );
}

function AgingTile({
  label,
  count,
  amount,
}: {
  label: string;
  count: number;
  amount: number;
}) {
  return (
    <div style={agingTileStyle}>
      <div style={agingLabelStyle}>{label}</div>
      <div style={agingCountStyle}>{count}</div>
      <div style={agingAmountStyle}>{formatMoney(amount)}</div>
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

const defaultBuckets: AgingBucket[] = [
  { label: "0–7 días", count: 0, amount: 0 },
  { label: "8–15 días", count: 0, amount: 0 },
  { label: "16–30 días", count: 0, amount: 0 },
  { label: "+30 días", count: 0, amount: 0 },
];

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

const sectionsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  background: "var(--viho-background)",
  padding: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 8,
};

const riskRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "4px 0",
  borderBottom: "1px solid rgba(0,0,0,0.05)",
};

const riskLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const riskAmountStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
};

const agingBlockStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  background: "var(--viho-background)",
  padding: 10,
};

const agingGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const agingTileStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 8,
  padding: 8,
  background: "var(--viho-surface)",
};

const agingLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--viho-muted)",
};

const agingCountStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginTop: 3,
};

const agingAmountStyle: React.CSSProperties = {
  fontSize: 10,
  marginTop: 2,
  fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#dc2626",
};