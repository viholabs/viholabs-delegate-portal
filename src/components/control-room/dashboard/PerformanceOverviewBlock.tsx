"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------ */
/* TYPES */
/* ------------------------------------------------ */

type ActorPerformance = {
  actor_name: string | null;
  sales: number;
};

type ChannelPerformance = {
  channel: string;
  sales: number;
};

type ProductPerformance = {
  product_name: string;
  sales: number;
};

type TrendPoint = {
  label: string;
  sales: number;
};

type PerformanceItem =
  | ActorPerformance
  | ChannelPerformance
  | ProductPerformance;

type PerformanceResponse = {
  ok: boolean;
  actors?: ActorPerformance[];
  channels?: ChannelPerformance[];
  products?: ProductPerformance[];
  trend?: TrendPoint[];
  error?: string;
};

/* ------------------------------------------------ */
/* COMPONENT */
/* ------------------------------------------------ */

export default function PerformanceOverviewBlock() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/control-room/performance", {
        cache: "no-store",
      });

      const json: PerformanceResponse = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "error loading performance");
      }

      setData(json);
    } catch (err: any) {
      setError(err?.message || "error loading performance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const interval = setInterval(load, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>PERFORMANCE</div>
        <div style={loadingStyle}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>PERFORMANCE</div>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>PERFORMANCE</div>

      <div style={gridStyle}>
        <PerformanceSection
          title="Ventas por actor"
          items={data?.actors || []}
        />

        <PerformanceSection
          title="Ventas por canal"
          items={data?.channels || []}
        />

        <PerformanceSection
          title="Ventas por producto"
          items={data?.products || []}
        />

        <TrendSection points={data?.trend || []} />
      </div>
    </div>
  );
}

/* ------------------------------------------------ */
/* SECTIONS */
/* ------------------------------------------------ */

function PerformanceSection({
  title,
  items,
}: {
  title: string;
  items: PerformanceItem[];
}) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>

      {items.length === 0 ? (
        <div style={emptyStyle}>Sin datos</div>
      ) : (
        items.slice(0, 5).map((item, i) => {
          const label = getItemLabel(item);

          return (
            <div key={i} style={rowStyle}>
              <div style={labelStyle}>{label}</div>
              <div style={valueStyle}>{formatMoney(item.sales)}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

function TrendSection({ points }: { points: TrendPoint[] }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Tendencia semanal</div>

      {points.length === 0 ? (
        <div style={emptyStyle}>Sin datos</div>
      ) : (
        <div style={trendStyle}>
          {points.map((p, i) => (
            <div key={i} style={trendRowStyle}>
              <div style={trendLabelStyle}>{p.label}</div>
              <div style={trendValueStyle}>{formatMoney(p.sales)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ */
/* HELPERS */
/* ------------------------------------------------ */

function getItemLabel(item: PerformanceItem) {
  if ("actor_name" in item) return item.actor_name || "—";
  if ("channel" in item) return item.channel;
  if ("product_name" in item) return item.product_name;
  return "—";
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

/* ------------------------------------------------ */
/* STYLES */
/* ------------------------------------------------ */

const containerStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 12,
  padding: 14,
  background: "var(--viho-surface)",
  marginBottom: 18,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 10,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,1fr)",
  gap: 10,
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--viho-border)",
  borderRadius: 10,
  padding: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 6,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 11,
  padding: "2px 0",
};

const labelStyle: React.CSSProperties = {
  color: "var(--viho-muted)",
};

const valueStyle: React.CSSProperties = {
  fontWeight: 600,
};

const trendStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const trendRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 11,
};

const trendLabelStyle: React.CSSProperties = {
  color: "var(--viho-muted)",
};

const trendValueStyle: React.CSSProperties = {
  fontWeight: 600,
};

const loadingStyle: React.CSSProperties = {
  fontSize: 12,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--viho-muted)",
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#dc2626",
};