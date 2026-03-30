"use client";

import { useEffect, useMemo, useState } from "react";

type BixGrowLogItem = {
  id: string;
  timestamp: string | null;
  status: string | null;
  conversions: number | null;
  referrals: number | null;
  errors: number | null;
};

type BixGrowLogResponse = {
  ok: boolean;
  items?: BixGrowLogItem[];
  error?: string;
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES");
}

function statusTone(status: string | null) {
  switch ((status || "").toLowerCase()) {
    case "success":
    case "ok":
      return "#1f7a1f";
    case "warning":
    case "partial":
      return "#9a6a00";
    case "error":
    case "failed":
      return "#a61b1b";
    case "not_configured":
      return "#6b7280";
    default:
      return "#6b7280";
  }
}

export default function BixGrowLogBlock() {
  const [data, setData] = useState<BixGrowLogResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch("/api/control-room/bixgrow-log", {
          cache: "no-store",
        });
        const json = (await res.json()) as BixGrowLogResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({
            ok: false,
            error: "No s’ha pogut carregar el log de BixGrow.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <div style={card}>
      <div style={eyebrow}>Technical</div>
      <div style={title}>BixGrow Log</div>

      {loading ? <div style={muted}>Carregant…</div> : null}

      {!loading && data && !data.ok ? (
        <div style={errorText}>{data.error || "Error carregant dades."}</div>
      ) : null}

      {!loading && data?.ok && items.length === 0 ? (
        <div style={muted}>Sense registres recents.</div>
      ) : null}

      {!loading && data?.ok && items.length > 0 ? (
        <div style={list}>
          {items.slice(0, 4).map((item) => (
            <div key={item.id} style={row}>
              <div style={rowTop}>
                <span
                  style={{
                    ...chip,
                    color: statusTone(item.status),
                    borderColor: `${statusTone(item.status)}33`,
                    background: `${statusTone(item.status)}12`,
                  }}
                >
                  {item.status || "unknown"}
                </span>
                <span style={rowDate}>{fmtDate(item.timestamp)}</span>
              </div>

              <div style={metrics}>
                <span>conversions {item.conversions ?? 0}</span>
                <span>referrals {item.referrals ?? 0}</span>
                <span>errors {item.errors ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.28)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251,246,236,0.78)",
  minHeight: 150,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.2,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
};

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: "#a61b1b",
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const row: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.66)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  padding: "5px 8px",
  borderRadius: 999,
  border: "1px solid transparent",
  textTransform: "uppercase",
};

const rowDate: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.72,
};

const metrics: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  opacity: 0.86,
};