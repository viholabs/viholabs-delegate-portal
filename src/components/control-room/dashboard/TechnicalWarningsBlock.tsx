"use client";

import { useEffect, useMemo, useState } from "react";

type WarningItem = {
  id: string;
  domain: string | null;
  message: string;
};

type TechnicalWarningsResponse = {
  ok: boolean;
  warnings?: WarningItem[];
  error?: string;
};

export default function TechnicalWarningsBlock() {
  const [data, setData] = useState<TechnicalWarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch("/api/control-room/technical-warnings", {
          cache: "no-store",
        });
        const json = (await res.json()) as TechnicalWarningsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({
            ok: false,
            error: "No s’han pogut carregar els warnings tècnics.",
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

  const warnings = useMemo(() => data?.warnings ?? [], [data]);

  return (
    <div style={card}>
      <div style={eyebrow}>Technical</div>
      <div style={title}>Technical Warnings</div>

      {loading ? <div style={muted}>Carregant…</div> : null}

      {!loading && data && !data.ok ? (
        <div style={errorText}>{data.error || "Error carregant dades."}</div>
      ) : null}

      {!loading && data?.ok && warnings.length === 0 ? (
        <div style={okBox}>Cap warning tècnic crític.</div>
      ) : null}

      {!loading && data?.ok && warnings.length > 0 ? (
        <div style={list}>
          {warnings.slice(0, 5).map((item) => (
            <div key={item.id} style={warningRow}>
              <div style={warningDomain}>{item.domain || "system"}</div>
              <div style={warningMessage}>{item.message}</div>
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

const okBox: React.CSSProperties = {
  fontSize: 12,
  color: "#1f7a1f",
  border: "1px solid rgba(31,122,31,0.18)",
  background: "rgba(31,122,31,0.08)",
  borderRadius: 12,
  padding: 10,
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const warningRow: React.CSSProperties = {
  border: "1px solid rgba(166,27,27,0.16)",
  background: "rgba(166,27,27,0.06)",
  borderRadius: 12,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const warningDomain: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#a61b1b",
};

const warningMessage: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
};