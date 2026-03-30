"use client";

import { useEffect, useMemo, useState } from "react";

type ImporterState = {
  last_sync_at: string | null;
  last_cursor: string | null;
  updated_at: string | null;
};

type HealthData = {
  holded_contacts: number;
  mappings: number;
  contacts_without_mapping: number;
  clients_without_mapping: number;
  invoices_without_mapping: number;
  duplicated_invoices: number;
  status: "green" | "yellow" | "red";
  importer?: ImporterState;
};

type ApiResponse = {
  ok: boolean;
  health?: HealthData;
  error?: string;
};

type PipelineState = "green" | "yellow" | "red" | "unknown";

const PIPELINE_GREEN_MAX_MINUTES = 90;
const PIPELINE_YELLOW_MAX_MINUTES = 150;

export default function ElElyonSystemHealth() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/control-room/el-elyon/holded-health", {
        cache: "no-store",
      });

      const data: ApiResponse = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Unknown error");
      }

      setHealth(data.health || null);
      setError(null);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || "Failed to load health data");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const interval = setInterval(() => {
      load();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const pipeline = useMemo(() => {
    return getPipelineHealth(health?.importer?.last_sync_at ?? null);
  }, [health?.importer?.last_sync_at]);

  const effectiveStatus = useMemo<"green" | "yellow" | "red">(() => {
    if (!health) return "green";

    if (health.status === "red" || pipeline.state === "red") return "red";
    if (health.status === "yellow" || pipeline.state === "yellow") return "yellow";
    return "green";
  }, [health, pipeline.state]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>SYSTEM HEALTH</div>
        <div>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>SYSTEM HEALTH</div>
        <div style={{ color: "#dc2626" }}>{error}</div>
      </div>
    );
  }

  if (!health) return null;

  const isCritical = effectiveStatus === "red";

  return (
    <div
      style={{
        ...containerStyle,
        borderColor: statusColor(effectiveStatus),
        animation: isCritical ? "pulseRed 1.5s infinite" : undefined,
      }}
    >
      <div style={titleRowStyle}>
        <div style={titleStyle}>SYSTEM HEALTH</div>

        <div
          style={{
            ...statusBadgeStyle,
            background: statusColor(effectiveStatus),
          }}
        >
          {statusLabel(effectiveStatus)}
        </div>
      </div>

      <div style={gridStyle}>
        <Metric label="Holded contacts" value={health.holded_contacts} />
        <Metric label="Mappings" value={health.mappings} />
        <Metric
          label="Contacts without mapping"
          value={health.contacts_without_mapping}
        />
        <Metric
          label="Clients without mapping"
          value={health.clients_without_mapping}
        />
        <Metric
          label="Invoices without mapping"
          value={health.invoices_without_mapping}
        />
        <Metric
          label="Duplicated invoices"
          value={health.duplicated_invoices}
        />
      </div>

      <div style={importBlockStyle}>
        <div style={importHeaderRowStyle}>
          <div style={importTitleStyle}>IMPORT PIPELINE</div>

          <div
            style={{
              ...pipelineBadgeStyle,
              background: pipelineColor(pipeline.state),
            }}
          >
            {pipelineLabel(pipeline.state)}
          </div>
        </div>

        <div style={importRowStyle}>
          <span style={importLabelStyle}>Last import:</span>
          <span>{formatDate(health.importer?.last_sync_at)}</span>
        </div>

        <div style={importRowStyle}>
          <span style={importLabelStyle}>Minutes since last sync:</span>
          <span>{pipeline.minutesText}</span>
        </div>

        <div style={importRowStyle}>
          <span style={importLabelStyle}>Expected cadence:</span>
          <span>~ 50–65 min</span>
        </div>

        <div style={importRowStyle}>
          <span style={importLabelStyle}>Thresholds:</span>
          <span>
            green ≤ {PIPELINE_GREEN_MAX_MINUTES} min · yellow ≤{" "}
            {PIPELINE_YELLOW_MAX_MINUTES} min · red &gt;{" "}
            {PIPELINE_YELLOW_MAX_MINUTES} min
          </span>
        </div>

        <div style={importRowStyle}>
          <span style={importLabelStyle}>Cursor:</span>
          <span>{health.importer?.last_cursor ?? "—"}</span>
        </div>

        <div style={importRowStyle}>
          <span style={importLabelStyle}>Updated:</span>
          <span>{formatDate(health.importer?.updated_at)}</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulseRed {
          0% {
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
          }
        }
      `}</style>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={metricStyle}>
      <div style={metricValueStyle}>{value}</div>
      <div style={metricLabelStyle}>{label}</div>
    </div>
  );
}

function getPipelineHealth(lastSyncAt: string | null): {
  state: PipelineState;
  minutes: number | null;
  minutesText: string;
} {
  if (!lastSyncAt) {
    return {
      state: "unknown",
      minutes: null,
      minutesText: "unknown",
    };
  }

  const parsed = new Date(lastSyncAt);
  const ms = parsed.getTime();

  if (Number.isNaN(ms)) {
    return {
      state: "unknown",
      minutes: null,
      minutesText: "unknown",
    };
  }

  const diffMs = Date.now() - ms;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes <= PIPELINE_GREEN_MAX_MINUTES) {
    return {
      state: "green",
      minutes,
      minutesText: String(minutes),
    };
  }

  if (minutes <= PIPELINE_YELLOW_MAX_MINUTES) {
    return {
      state: "yellow",
      minutes,
      minutesText: String(minutes),
    };
  }

  return {
    state: "red",
    minutes,
    minutesText: String(minutes),
  };
}

function statusColor(status: "green" | "yellow" | "red") {
  if (status === "green") return "#16a34a";
  if (status === "yellow") return "#ca8a04";
  return "#dc2626";
}

function statusLabel(status: "green" | "yellow" | "red") {
  if (status === "green") return "SYSTEM INTEGRITY OK";
  if (status === "yellow") return "ATTENTION REQUIRED";
  return "STRUCTURAL ERROR";
}

function pipelineColor(state: PipelineState) {
  if (state === "green") return "#16a34a";
  if (state === "yellow") return "#ca8a04";
  if (state === "red") return "#dc2626";
  return "#6b7280";
}

function pipelineLabel(state: PipelineState) {
  if (state === "green") return "RUNNER ALIVE";
  if (state === "yellow") return "STALE";
  if (state === "red") return "PIPELINE DEAD";
  return "UNKNOWN";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  return d.toLocaleString();
}

/* ----------------------- */
/* styles */
/* ----------------------- */

const containerStyle: React.CSSProperties = {
  background: "var(--viho-surface)",
  border: "1px solid var(--viho-border)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 24,
};

const titleRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
  gap: 12,
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
};

const statusBadgeStyle: React.CSSProperties = {
  color: "white",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 16,
};

const metricStyle: React.CSSProperties = {
  background: "var(--viho-background)",
  borderRadius: 8,
  padding: 14,
  textAlign: "center",
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--viho-muted)",
};

const importBlockStyle: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 16,
  borderTop: "1px solid var(--viho-border)",
};

const importHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 10,
};

const importTitleStyle: React.CSSProperties = {
  fontWeight: 600,
};

const pipelineBadgeStyle: React.CSSProperties = {
  color: "white",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const importRowStyle: React.CSSProperties = {
  fontSize: 13,
  marginBottom: 6,
};

const importLabelStyle: React.CSSProperties = {
  fontWeight: 600,
  marginRight: 6,
};