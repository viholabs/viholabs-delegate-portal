"use client";

import { useEffect, useState } from "react";

type ActivityItem = {
  id: string;
  timestamp: string | null;
  actor_name: string | null;
  action_type: string;
  entity_type: string | null;
  entity_label: string | null;
  message: string | null;
  severity: "info" | "warning" | "critical";
};

type ActivityResponse = {
  ok: boolean;
  items?: ActivityItem[];
  error?: string;
};

export default function ActivityTimelineBlock() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/control-room/activity", {
        cache: "no-store",
      });

      const json: ActivityResponse = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "error loading activity timeline");
      }

      setItems(json.items || []);
    } catch (err: any) {
      setError(err?.message || "error loading activity timeline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const interval = setInterval(() => {
      load();
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>ACTIVIDAD</div>
        <div style={loadingStyle}>Loading activity…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>ACTIVIDAD</div>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>ACTIVIDAD</div>

      {items.length === 0 ? (
        <div style={emptyStyle}>Sin actividad reciente.</div>
      ) : (
        <div style={timelineStyle}>
          {items.slice(0, 12).map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div style={rowStyle}>
      <div style={timeStyle}>{formatTime(item.timestamp)}</div>

      <div
        style={{
          ...badgeStyle,
          background: severityColor(item.severity),
        }}
      >
        {item.action_type}
      </div>

      <div style={messageStyle}>
        {item.message ||
          `${item.actor_name || "Sistema"} → ${item.entity_type || ""} ${
            item.entity_label || ""
          }`}
      </div>
    </div>
  );
}

function severityColor(sev: "info" | "warning" | "critical") {
  if (sev === "critical") return "#dc2626";
  if (sev === "warning") return "#ca8a04";
  return "#2563eb";
}

function formatTime(value: string | null) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* styles */

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

const timelineStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 11,
};

const timeStyle: React.CSSProperties = {
  width: 48,
  color: "var(--viho-muted)",
  fontVariantNumeric: "tabular-nums",
};

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#fff",
  padding: "3px 6px",
  borderRadius: 6,
};

const messageStyle: React.CSSProperties = {
  flex: 1,
};

const loadingStyle: React.CSSProperties = {
  fontSize: 12,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#16a34a",
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#dc2626",
};