// src/components/control-room/dashboard/PriorityInboxBlock.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AlertApiItem = {
  id?: string;
  type?: "critical" | "warning" | "info" | string;
  message?: string;
};

type ActivityApiItem = {
  type?: string;
  label?: string;
  entity_id?: string | null;
  timestamp?: string | null;
};

type ClientApiItem = {
  id?: string;
  name?: string | null;
  orphan_client?: boolean;
  needs_review?: boolean;
};

type InboxItem = {
  id: string;
  kind: "alert" | "activity" | "client_orphan" | "client_review";
  label: string;
  severity: "high" | "medium" | "low";
  href: string;
};

function normalizeAlertSeverity(
  type: AlertApiItem["type"],
): "high" | "medium" | "low" {
  if (type === "critical") return "high";
  if (type === "warning") return "medium";
  return "low";
}

function sortBySeverity(items: InboxItem[]) {
  const order = { high: 0, medium: 1, low: 2 };
  return [...items].sort((a, b) => order[a.severity] - order[b.severity]);
}

export default function PriorityInboxBlock() {
  const router = useRouter();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [alertsRes, activityRes, clientsRes] = await Promise.all([
          fetch("/api/control-room/alerts", { cache: "no-store" }).then((r) =>
            r.json(),
          ),
          fetch("/api/control-room/activity", { cache: "no-store" }).then((r) =>
            r.json(),
          ),
          fetch("/api/control-room/clients-monitor", {
            cache: "no-store",
          }).then((r) => r.json()),
        ]);

        const merged: InboxItem[] = [];

        if (Array.isArray(alertsRes?.alerts)) {
          for (const a of alertsRes.alerts as AlertApiItem[]) {
            const severity = normalizeAlertSeverity(a.type);
            const message = String(a.message ?? "Alerta").trim() || "Alerta";

            const href =
              a.type === "critical" || a.type === "warning"
                ? "/control-room/shell?tab=facturacion"
                : "/control-room/shell?tab=el-elyon";

            merged.push({
              id: `alert:${String(a.id ?? message)}`,
              kind: "alert",
              label: message,
              severity,
              href,
            });
          }
        }

        if (Array.isArray(activityRes?.items)) {
          for (const a of (activityRes.items as ActivityApiItem[]).slice(0, 10)) {
            const label =
              String(a.label ?? "Actividad").trim() || "Actividad operativa";

            merged.push({
              id: `activity:${String(a.entity_id ?? a.timestamp ?? label)}`,
              kind: "activity",
              label,
              severity: "low",
              href: "/control-room/shell?tab=el-elyon",
            });
          }
        }

        if (Array.isArray(clientsRes?.items)) {
          for (const c of clientsRes.items as ClientApiItem[]) {
            const clientId = String(c.id ?? "");
            const clientName = String(c.name ?? "—");

            if (c.orphan_client) {
              merged.push({
                id: `client_orphan:${clientId || clientName}`,
                kind: "client_orphan",
                label: `Cliente sin delegado: ${clientName}`,
                severity: "high",
                href: "/control-room/shell?tab=el-elyon",
              });
            }

            if (c.needs_review) {
              merged.push({
                id: `client_review:${clientId || clientName}`,
                kind: "client_review",
                label: `Cliente con incidencias: ${clientName}`,
                severity: "medium",
                href: "/control-room/shell?tab=el-elyon",
              });
            }
          }
        }

        if (!cancelled) {
          setItems(sortBySeverity(merged).slice(0, 20));
        }
      } catch (error) {
        console.error("PriorityInboxBlock load error", error);
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    return {
      high: items.filter((i) => i.severity === "high").length,
      medium: items.filter((i) => i.severity === "medium").length,
      low: items.filter((i) => i.severity === "low").length,
    };
  }, [items]);

  function handleOpen(item: InboxItem) {
    router.push(item.href);
  }

  return (
    <div style={card}>
      <div style={headerRow}>
        <div style={title}>PRIORITY INBOX</div>

        {!loading && items.length > 0 && (
          <div style={badgesRow}>
            {counts.high > 0 && (
              <span style={{ ...badge, ...badgeHigh }}>{counts.high} high</span>
            )}
            {counts.medium > 0 && (
              <span style={{ ...badge, ...badgeMedium }}>
                {counts.medium} medium
              </span>
            )}
            {counts.low > 0 && (
              <span style={{ ...badge, ...badgeLow }}>{counts.low} low</span>
            )}
          </div>
        )}
      </div>

      {loading && <div style={muted}>Loading...</div>}

      {!loading && items.length === 0 && (
        <div style={muted}>No hay incidencias</div>
      )}

      <div style={list}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleOpen(item)}
            style={{
              ...row,
              ...(item.severity === "high"
                ? rowHigh
                : item.severity === "medium"
                  ? rowMedium
                  : rowLow),
            }}
          >
            <span style={rowText}>{item.label}</span>
            <span style={rowAction}>Abrir</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.25)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251,246,236,0.6)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
};

const badgesRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const badge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: "4px 8px",
  lineHeight: 1,
};

const badgeHigh: React.CSSProperties = {
  background: "rgba(220,38,38,0.12)",
  color: "#991b1b",
};

const badgeMedium: React.CSSProperties = {
  background: "rgba(202,138,4,0.12)",
  color: "#854d0e",
};

const badgeLow: React.CSSProperties = {
  background: "rgba(0,0,0,0.06)",
  color: "#374151",
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const row: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 8,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  cursor: "pointer",
  background: "transparent",
};

const rowHigh: React.CSSProperties = {
  background: "rgba(255,0,0,0.08)",
};

const rowMedium: React.CSSProperties = {
  background: "rgba(255,165,0,0.08)",
};

const rowLow: React.CSSProperties = {
  background: "rgba(0,0,0,0.04)",
};

const rowText: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
};

const rowAction: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  opacity: 0.72,
  whiteSpace: "nowrap",
};