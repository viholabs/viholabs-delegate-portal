"use client";

import { useEffect, useMemo, useState } from "react";
import SystemStatusIndicator from "./SystemStatusIndicator";

type MonthResponse = {
  ok: boolean;
  revenue?: number;
  units_sold?: number;
  units_promo?: number;
};

type ObjectivesResponse = {
  ok: boolean;
  revenue_target?: number;
  units_target?: number;
};

type WarningsResponse = {
  ok: boolean;
  warnings?: { id: string }[];
};

type OrdersResponse = {
  ok: boolean;
  open_orders?: number;
};

export default function ExecutiveSummaryBlock() {
  const [month, setMonth] = useState<MonthResponse | null>(null);
  const [objectives, setObjectives] = useState<ObjectivesResponse | null>(null);
  const [warnings, setWarnings] = useState<WarningsResponse | null>(null);
  const [orders, setOrders] = useState<OrdersResponse | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const [m, o, w, ord] = await Promise.all([
          fetch("/api/control-room/month", { cache: "no-store" }),
          fetch("/api/control-room/objectives", { cache: "no-store" }),
          fetch("/api/control-room/technical-warnings", { cache: "no-store" }),
          fetch("/api/control-room/orders", { cache: "no-store" }),
        ]);

        const mj = await m.json();
        const oj = await o.json();
        const wj = await w.json();
        const orj = await ord.json();

        if (!cancelled) {
          setMonth(mj);
          setObjectives(oj);
          setWarnings(wj);
          setOrders(orj);
        }
      } catch {
        if (!cancelled) {
          setMonth(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const revenue = month?.revenue ?? 0;
  const units = month?.units_sold ?? 0;
  const promo = month?.units_promo ?? 0;

  const revenueTarget = objectives?.revenue_target ?? 0;
  const unitsTarget = objectives?.units_target ?? 0;

  const warningsCount = warnings?.warnings?.length ?? 0;
  const openOrders = orders?.open_orders ?? 0;

  const progressRevenue = useMemo(() => {
    if (!revenueTarget) return 0;
    return Math.min(100, Math.round((revenue / revenueTarget) * 100));
  }, [revenue, revenueTarget]);

  const progressUnits = useMemo(() => {
    if (!unitsTarget) return 0;
    return Math.min(100, Math.round((units / unitsTarget) * 100));
  }, [units, unitsTarget]);

  return (
    <div style={card}>
      <div style={header}>
        <div style={title}>Executive Summary</div>
        <SystemStatusIndicator />
      </div>

      {loading && <div style={muted}>Carregant…</div>}

      {!loading && (
        <>
          <div style={metricsGrid}>
            <Metric label="Facturación mes" value={fmtCurrency(revenue)} />
            <Metric label="Unidades vendidas" value={units} />
            <Metric label="Unidades promo" value={promo} />
            <Metric label="Pedidos abiertos" value={openOrders} />
            <Metric
              label="Warnings"
              value={warningsCount}
              tone={warningsCount > 0 ? "warning" : "ok"}
            />
          </div>

          <div style={progressSection}>
            <Progress
              label="Objetivo facturación"
              value={progressRevenue}
            />

            <Progress
              label="Objetivo unidades"
              value={progressUnits}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "ok";
}) {
  const color =
    tone === "warning"
      ? "#a61b1b"
      : tone === "ok"
      ? "#1f7a1f"
      : "#111";

  return (
    <div style={metric}>
      <div style={metricLabel}>{label}</div>
      <div style={{ ...metricValue, color }}>{value}</div>
    </div>
  );
}

function Progress({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div style={progressBlock}>
      <div style={progressLabel}>
        {label} {value}%
      </div>

      <div style={progressBar}>
        <div
          style={{
            ...progressFill,
            width: `${value}%`,
          }}
        />
      </div>
    </div>
  );
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.28)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(251,246,236,0.78)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const title: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
};

const metricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
  gap: 10,
};

const metric: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const metricLabel: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
};

const metricValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
};

const progressSection: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const progressBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const progressLabel: React.CSSProperties = {
  fontSize: 11,
};

const progressBar: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: "rgba(0,0,0,0.08)",
};

const progressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "#C7AE6A",
};