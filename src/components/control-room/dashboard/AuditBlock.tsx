"use client";

import { useEffect, useMemo, useState } from "react";

type AuditItem = {
  id: string;
  created_at: string | null;
  actor_label: string | null;
  action: string | null;
  entity: string | null;
  invoice_number?: string | null;
};

type AuditResponse = {
  ok: boolean;
  rows?: AuditItem[];
  error?: string;
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES");
}

export default function AuditBlock() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);

        const res = await fetch("/api/control-room/audit", {
          cache: "no-store",
        });

        const json = (await res.json()) as AuditResponse;

        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setData({
            ok: false,
            error: "No s’ha pogut carregar l’auditoria.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => data?.rows ?? [], [data]);

  return (
    <div style={card}>
      <div style={eyebrow}>Traceability</div>
      <div style={title}>Audit</div>

      {loading && <div style={muted}>Carregant…</div>}

      {!loading && data && !data.ok && (
        <div style={errorText}>
          {data.error || "Error carregant dades."}
        </div>
      )}

      {!loading && data?.ok && items.length === 0 && (
        <div style={muted}>Sense accions auditables recents.</div>
      )}

      {!loading && data?.ok && items.length > 0 && (
        <div style={list}>
          {items.slice(0, 6).map((item) => (
            <div key={item.id} style={row}>
              <div style={rowTop}>
                <div style={action}>
                  {(item.action || "ACTION").toUpperCase()}
                </div>
                <div style={date}>{fmtDate(item.created_at)}</div>
              </div>

              <div style={summary}>
                {renderSummary(item)}
              </div>

              <div style={meta}>
                <span>{item.actor_label || "System"}</span>
                <span>{item.entity || "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderSummary(item: AuditItem) {
  if (item.entity === "invoice" && item.invoice_number) {
    return `${item.action ?? "action"} · Invoice ${item.invoice_number}`;
  }

  if (item.entity) {
    return `${item.action ?? "action"} · ${item.entity}`;
  }

  return item.action ?? "action";
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

const action: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const date: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.72,
};

const summary: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
};

const meta: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  opacity: 0.82,
};