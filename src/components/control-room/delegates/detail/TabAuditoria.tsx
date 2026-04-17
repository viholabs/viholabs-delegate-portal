"use client";

// src/components/control-room/delegates/detail/TabAuditoria.tsx
// Log de auditoría: cambios en el registro del delegado desde audit_change_log.

import type { AuditEntry, DelegateDetailActor } from "../types";
import { formatDatetime } from "../utils";

type Props = {
  audit: AuditEntry[];
  delegate: DelegateDetailActor;
};

export default function TabAuditoria({ audit, delegate }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
          <div className="text-base font-semibold text-[color:var(--viho-primary)]">
            Log de auditoría
          </div>
          <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
            Cambios registrados para {delegate.name ?? delegate.id} —{" "}
            {audit.length} entradas (máx. 50)
          </div>
        </div>

        {audit.length === 0 ? (
          <div className="px-5 py-8 text-sm text-[color:var(--viho-muted)]">
            No hay entradas de auditoría registradas para este delegado.
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--viho-border)]">
            {audit.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-[color:var(--viho-muted)]">
        Fuente: <code className="font-mono">audit_change_log</code>. Solo se muestran las
        mutaciones con <code className="font-mono">row_pk = actor_id</code> del delegado. Para
        auditoría de propuestas de liquidación, consulta el módulo de Liquidación.
      </p>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const actionColor = {
    INSERT: "border-emerald-200 bg-emerald-50 text-emerald-700",
    UPDATE: "border-blue-200 bg-blue-50 text-blue-700",
    DELETE: "border-red-200 bg-red-50 text-red-700",
  }[entry.action.toUpperCase()] ?? "border-neutral-200 bg-neutral-100 text-neutral-600";

  return (
    <div className="flex flex-wrap items-start gap-3 px-5 py-3">
      {/* Timestamp */}
      <div className="w-36 shrink-0 text-xs text-[color:var(--viho-muted)]">
        {formatDatetime(entry.ts)}
      </div>

      {/* Acción */}
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${actionColor}`}
      >
        {entry.action}
      </span>

      {/* Tabla */}
      <span className="text-xs font-mono text-[color:var(--viho-muted)]">
        {entry.table_name}
      </span>

      {/* Motivo */}
      {(entry.reason_code || entry.reason_text) && (
        <span className="text-xs text-[color:var(--viho-muted)]">
          {[entry.reason_code, entry.reason_text].filter(Boolean).join(" — ")}
        </span>
      )}

      {/* Fuente */}
      {entry.source && entry.source !== "database" && (
        <span className="ml-auto text-xs text-[color:var(--viho-muted)] opacity-60">
          {entry.source}
        </span>
      )}
    </div>
  );
}
