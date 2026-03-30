"use client";

import { useEffect, useMemo, useState } from "react";

type MonthResponse = {
  ok: boolean;
  revenue?: number;
};

type TodayResponse = {
  ok: boolean;
  revenue_today?: number;
};

type ObjectivesResponse = {
  ok: boolean;
  revenue_target?: number;
};

export default function KPIEngineBlock() {
  const [month, setMonth] = useState<MonthResponse | null>(null);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [objectives, setObjectives] = useState<ObjectivesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const [m, t, o] = await Promise.all([
          fetch("/api/control-room/month", { cache: "no-store" }),
          fetch("/api/control-room/today", { cache: "no-store" }),
          fetch("/api/control-room/objectives", { cache: "no-store" }),
        ]);

        const mj = await m.json();
        const tj = await t.json();
        const oj = await o.json();

        if (!cancelled) {
          setMonth(mj);
          setToday(tj);
          setObjectives(oj);
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

  const revenueMonth = month?.revenue ?? 0;
  const revenueToday = today?.revenue_today ?? 0;
  const targetMonth = objectives?.revenue_target ?? 0;

  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const runRate = useMemo(() => {
    if (day === 0) return 0;
    return Math.round((revenueMonth / day) * daysInMonth);
  }, [revenueMonth, day, daysInMonth]);

  const forecastProgress = useMemo(() => {
    if (!targetMonth) return 0;
    return Math.round((runRate / targetMonth) * 100);
  }, [runRate, targetMonth]);

  const todayTarget = useMemo(() => {
    if (!targetMonth) return 0;
    return Math.round(targetMonth / daysInMonth);
  }, [targetMonth, daysInMonth]);

  return (
    <div style={card}>
      <div style={title}>KPI Engine</div>

      {loading && <div style={muted}>Carregant…</div>}

      {!loading && (
        <>
          <div style={grid}>
            <Metric label="Ventas hoy" value={fmtCurrency(revenueToday)} />
            <Metric label="Objetivo día" value={fmtCurrency(todayTarget)} />
            <Metric label="Run rate mensual" value={fmtCurrency(runRate)} />
            <Metric label="Forecast fin de mes" value={`${forecastProgress}%`} />
          </div>

          <div style={progressBar}>
            <div
              style={{
                ...progressFill,
                width: `${Math.min(forecastProgress, 100)}%`,
              }}
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
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div style={metric}>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
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
  gap: 12,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
  gap: 10,
};

const metric: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const metricLabel: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
};

const metricValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
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