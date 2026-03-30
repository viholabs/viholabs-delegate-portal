"use client";

import { useEffect, useMemo, useState } from "react";

type IntegrationItem = {
  key: string;
  label: string;
  status: string | null;
  last_sync_at: string | null;
  message: string | null;
};

type IntegrationsResponse = {
  ok: boolean;
  integrations?: IntegrationItem[];
  error?: string;
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES");
}

function tone(status: string | null) {
  switch ((status || "").toLowerCase()) {
    case "green":
    case "success":
    case "connected":
      return "#1f7a1f";
    case "amber":
    case "warning":
      return "#9a6a00";
    case "red":
    case "error":
    case "disconnected":
      return "#a61b1b";
    default:
      return "#6b7280";
  }
}

export default function IntegrationsBlock() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch("/api/control-room/integrations", {
          cache: "no-store",
        });
        const json = (await res.json()) as IntegrationsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({
            ok: false,
            error: "No s’han pogut carregar les integracions.",
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

  const integrations = useMemo(() => data?.integrations ?? [], [data]);

  return (
    <div style={card}>
      <div style={eyebrow}>Global State</div>
      <div style={title}>Integrations</div>

      {loading ? <div style={muted}>Carregant…</div> : null}

      {!loading && data && !data.ok ? (
        <div style={errorText}>{data.error || "Error carregant dades."}</div>
      ) : null}

      {!loading && data?.ok && integrations.length === 0 ? (
        <div style={muted}>Sense integracions registrades.</div>
      ) : null}

      {!loading && data?.ok && integrations.length > 0 ? (
        <div style={list}>
          {integrations.slice(0, 5).map((item) => {
            const c = tone(item.status);
            return (
              <div key={item.key} style={row}>
                <div style={rowTop}>
                  <div style={serviceName}>{item.label}</div>
                  <span
                    style={{
                      ...dot,
                      background: c,
                      boxShadow: `0 0 0 3px ${c}22`,
                    }}
                  />
                </div>

                <div style={meta}>
                  <span>{item.message || item.status || "unknown"}</span>
                  <span>{fmtDate(item.last_sync_at)}</span>
                </div>
              </div>
            );
          })}
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

const serviceName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
};

const dot: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  display: "inline-block",
};

const meta: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  opacity: 0.86,
};