"use client";

import { useEffect, useState } from "react";

type Status = "ok" | "warning" | "incident";

type WarningsResponse = {
  ok: boolean;
  warnings?: { id: string }[];
};

export default function SystemStatusIndicator() {
  const [status, setStatus] = useState<Status>("ok");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/control-room/technical-warnings", {
          cache: "no-store",
        });

        const json = (await res.json()) as WarningsResponse;

        const warnings = json?.warnings?.length ?? 0;

        if (cancelled) return;

        if (warnings === 0) {
          setStatus("ok");
        } else if (warnings < 3) {
          setStatus("warning");
        } else {
          setStatus("incident");
        }
      } catch {
        if (!cancelled) {
          setStatus("incident");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const config = getStatusConfig(status);

  return (
    <div
      style={{
        ...container,
        borderColor: config.color,
        background: `${config.color}12`,
      }}
    >
      <div style={{ ...dot, background: config.color }} />
      <div style={label}>{config.label}</div>
    </div>
  );
}

function getStatusConfig(status: Status) {
  switch (status) {
    case "ok":
      return {
        label: "OPERACIÓN NORMAL",
        color: "#1f7a1f",
      };

    case "warning":
      return {
        label: "ATENCIÓN",
        color: "#9a6a00",
      };

    case "incident":
      return {
        label: "INCIDENTE",
        color: "#a61b1b",
      };
  }
}

const container: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "2px solid",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  width: "fit-content",
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
};

const label: React.CSSProperties = {
  letterSpacing: "0.04em",
};