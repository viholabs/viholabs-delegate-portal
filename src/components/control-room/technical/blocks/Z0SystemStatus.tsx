"use client";

// VIHOLABS — Z0 System Status (CANÓNICO / NO ICONOGRAPHY)

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Z0SystemStatusModel } from "../technical.types";

function statusText(status: Z0SystemStatusModel["status"]) {
  switch (status) {
    case "OK":
      return "Sistema estable";
    case "DEGRADED":
      return "Sistema degradat";
    case "CRITICAL":
      return "Estat crític";
  }
}

function statusColor(status: Z0SystemStatusModel["status"]) {
  if (status === "CRITICAL") return "var(--viho-danger)";
  if (status === "DEGRADED") return "var(--viho-warning)";
  return "var(--viho-primary)";
}

export default function Z0SystemStatus(props: { model: Z0SystemStatusModel }) {
  const m = props.model;

  const incidents =
    typeof m.openIncidentsCount === "number" ? String(m.openIncidentsCount) : "—";

  const lastCheckAt = m.lastCheckAt ?? "—";
  const summary = m.summary ?? "Sense anomalies rellevants detectades.";

  return (
    <section className="viho-block">
      <Card
        className="rounded-2xl border"
        style={{
          borderColor: "var(--viho-border)",
          background: "var(--viho-surface-1)",
        }}
      >
        <CardHeader className="pb-2">
          <CardTitle
            className="text-xs font-semibold tracking-wide"
            style={{ color: "var(--viho-muted)" }}
          >
            ESTAT DEL SISTEMA
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-0">
          <div
            className="text-base font-semibold"
            style={{ color: statusColor(m.status) }}
          >
            {statusText(m.status)}
          </div>

          <div className="mt-2 flex gap-6 text-xs">
            <div style={{ color: "var(--viho-muted)" }}>
              Incidències actives:{" "}
              <span style={{ color: "var(--viho-primary)" }}>{incidents}</span>
            </div>

            <div style={{ color: "var(--viho-muted)" }}>
              Última validació:{" "}
              <span style={{ color: "var(--viho-primary)" }}>{lastCheckAt}</span>
            </div>
          </div>

          <div
            className="mt-3 text-sm"
            style={{ color: "var(--viho-muted)" }}
          >
            {summary}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
