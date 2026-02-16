"use client";

// src/components/control-room/technical/blocks/Z1Subsystems.tsx
// VIHOLABS — Z1 (Subsistemes) amb últims 5 logs per card (presentational-only)

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type Z1SubsystemStatus = "OK" | "DEGRADED" | "CRITICAL";

export type Z1LogSeverity = "INFO" | "WARN" | "CRITICAL";

export type Z1SubsystemLogItem = {
  at: string; // ja formatat (ex: "07:41", "avui 07:41", ISO -> més endavant)
  message: string; // curt, executiu, sense tecnicismes
  severity: Z1LogSeverity;
};

export type Z1SubsystemItem = {
  key: string;
  label: string;
  status: Z1SubsystemStatus;
  note?: string;

  // NOVETAT: últims logs (ordenats de més recent -> més antic idealment)
  logs?: Z1SubsystemLogItem[];
};

function statusText(status: Z1SubsystemStatus) {
  switch (status) {
    case "OK":
      return "OK";
    case "DEGRADED":
      return "DEGRADED";
    case "CRITICAL":
      return "CRITICAL";
  }
}

function statusColor(status: Z1SubsystemStatus) {
  if (status === "CRITICAL") return "var(--viho-danger)";
  if (status === "DEGRADED") return "var(--viho-warning)";
  return "var(--viho-muted)";
}

function severityText(sev: Z1LogSeverity) {
  switch (sev) {
    case "INFO":
      return "INFO";
    case "WARN":
      return "WARN";
    case "CRITICAL":
      return "CRITICAL";
  }
}

function severityColor(sev: Z1LogSeverity) {
  if (sev === "CRITICAL") return "var(--viho-danger)";
  if (sev === "WARN") return "var(--viho-warning)";
  return "var(--viho-muted)";
}

function takeLast5(logs?: Z1SubsystemLogItem[]) {
  const arr = Array.isArray(logs) ? logs : [];
  return arr.slice(0, 5);
}

export default function Z1Subsystems(props: { items: Z1SubsystemItem[] }) {
  const items = props.items || [];

  return (
    <section className="viho-block">
      <div className="viho-block-header">SUBSISTEMES &amp; INTEGRACIONS</div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => {
          const logs = takeLast5(s.logs);

          return (
            <Card
              key={s.key}
              className="rounded-2xl border"
              style={{
                borderColor: "var(--viho-border)",
                background: "var(--viho-surface-1)",
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-baseline justify-between gap-3">
                  <CardTitle className="text-sm font-semibold" style={{ color: "var(--viho-primary)" }}>
                    {s.label}
                  </CardTitle>

                  <div
                    className="text-[11px] font-semibold tracking-wide"
                    style={{ color: statusColor(s.status), whiteSpace: "nowrap" }}
                    aria-label={`Status ${statusText(s.status)}`}
                  >
                    {statusText(s.status)}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {/* Nota executiva */}
                {s.note ? (
                  <div className="text-xs leading-snug" style={{ color: "var(--viho-muted)" }}>
                    {s.note}
                  </div>
                ) : (
                  <div className="text-xs leading-snug" style={{ color: "var(--viho-muted)" }}>
                    Sense incidències operatives registrades.
                  </div>
                )}

                {/* Logs (últims 5) */}
                <div className="mt-3">
                  <div className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--viho-muted)" }}>
                    ÚLTIMS 5 EVENTS
                  </div>

                  {logs.length === 0 ? (
                    <div className="mt-2 text-xs" style={{ color: "var(--viho-muted)" }}>
                      No hi ha events recents.
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {logs.map((e, idx) => (
                        <div key={`${s.key}-${idx}`} className="flex gap-3">
                          <div className="w-[64px] shrink-0 text-[11px]" style={{ color: "var(--viho-muted)" }}>
                            {e.at}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="truncate text-xs" style={{ color: "var(--viho-primary)" }}>
                                {e.message}
                              </div>

                              <div
                                className="text-[11px] font-semibold tracking-wide"
                                style={{ color: severityColor(e.severity), whiteSpace: "nowrap" }}
                              >
                                {severityText(e.severity)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
