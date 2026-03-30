"use client";

import { useEffect, useMemo, useState } from "react";

type RadarItem = {
  label: string;
  value: number;
};

type RadarResponse = {
  ok: boolean;
  by_channel?: RadarItem[];
  by_delegate?: RadarItem[];
  by_client?: RadarItem[];
};

export default function RevenueRadarBlock() {
  const [data, setData] = useState<RadarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const res = await fetch("/api/control-room/revenue-radar", {
          cache: "no-store",
        });

        const json = await res.json();

        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const channels = useMemo(() => data?.by_channel ?? [], [data]);
  const delegates = useMemo(() => data?.by_delegate ?? [], [data]);
  const clients = useMemo(() => data?.by_client ?? [], [data]);

  return (
    <div style={card}>
      <div style={title}>Revenue Radar</div>

      {loading && <div style={muted}>Carregant…</div>}

      {!loading && (
        <div style={sections}>
          <RadarSection title="Canales" items={channels} />
          <RadarSection title="Delegados" items={delegates} />
          <RadarSection title="Clientes" items={clients} />
        </div>
      )}
    </div>
  );
}

function RadarSection({
  title,
  items,
}: {
  title: string;
  items: RadarItem[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div style={section}>
      <div style={sectionTitle}>{title}</div>

      <div style={list}>
        {items.slice(0, 5).map((item) => (
          <div key={item.label} style={row}>
            <div style={rowTop}>
              <span>{item.label}</span>
              <span>{fmtCurrency(item.value)}</span>
            </div>

            <div style={bar}>
              <div
                style={{
                  ...barFill,
                  width: `${(item.value / max) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
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

const sections: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 12,
};

const section: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  opacity: 0.8,
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const row: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
};

const bar: React.CSSProperties = {
  height: 4,
  background: "rgba(0,0,0,0.08)",
  borderRadius: 999,
};

const barFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "#C7AE6A",
};