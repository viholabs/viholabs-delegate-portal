//src/components/control-room/technical/blocks/Z2Pipelines.tsx <<'EOF'
"use client";

import React from "react";

export type Z2PipelineStatus = "OK" | "UNKNOWN" | "DEGRADED" | "CRITICAL";

export type Z2PipelineError = {
  type: "auth" | "schema" | "mapping" | "runtime";
  message: string;
};

export type Z2PipelineRow = {
  key: "holded" | "shopify" | "bixgrow" | "commissions";
  label: string;
  status: Z2PipelineStatus;
  last_batch?: string | null;
  records_affected?: string | null;
  errors?: Z2PipelineError[] | null;
};

export type Z2PipelinesModel = {
  rows: Z2PipelineRow[];
};

function statusLabel(s: Z2PipelineStatus): string {
  if (s === "CRITICAL") return "CRITICAL";
  if (s === "DEGRADED") return "DEGRADED";
  if (s === "UNKNOWN") return "UNKNOWN";
  return "OK";
}

function statusColor(s: Z2PipelineStatus): string {
  if (s === "CRITICAL") return "var(--viho-danger)";
  if (s === "DEGRADED") return "var(--viho-warning)";
  if (s === "UNKNOWN") return "var(--viho-muted, #8a8a8a)";
  return "var(--viho-success)";
}

function errorText(errors?: Z2PipelineError[] | null) {
  const arr = Array.isArray(errors) ? errors : [];
  if (!arr.length) return "—";
  // executive: compacte, sense dumps
  return arr
    .slice(0, 2)
    .map((e) => e.message)
    .filter(Boolean)
    .join(" · ");
}

export default function Z2Pipelines({ model }: { model: Z2PipelinesModel }) {
  const rows = Array.isArray(model?.rows) ? model.rows : [];

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white/70 shadow-sm">
      <div className="flex items-start justify-between px-4 py-3">
        <div>
          <div className="text-[12px] font-medium tracking-wide text-neutral-700">PIPELINES &amp; INGESTA</div>
        </div>
        <div className="text-[11px] text-neutral-500">Actualitzat: —</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-neutral-50 text-[11px] font-medium text-neutral-700">
              <th className="px-4 py-2">PIPELINE</th>
              <th className="px-4 py-2">ESTAT</th>
              <th className="px-4 py-2">ÚLTIM LOT</th>
              <th className="px-4 py-2">REGISTRES</th>
              <th className="px-4 py-2">ERRORS (SI N&apos;HI HA)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const label = statusLabel(r.status);
              const color = statusColor(r.status);

              // UNKNOWN = realitat: no telemetria
              const errors =
                r.status === "UNKNOWN" && (!r.errors || !r.errors.length)
                  ? [{ type: "runtime" as const, message: "Sense telemetria / ping no integrat" }]
                  : r.errors;

              return (
                <tr key={r.key} className="border-t border-neutral-200 text-[12px] text-neutral-800">
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      <span className={r.status === "UNKNOWN" ? "text-neutral-700" : "text-neutral-900"}>
                        {label}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.last_batch ?? "—"}</td>
                  <td className="px-4 py-3">{r.records_affected ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-700">{errorText(errors)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 pb-3 pt-2 text-[11px] text-neutral-500">
        Nota: aquest bloc és operatiu (live). No exposa credencials ni detalls sensibles.
      </div>
    </section>
  );
}