"use client";

import React, { useEffect, useState } from "react";

type AuditRow = {
  id: string;
  created_at: string;
  action: string | null;
  status: string | null;
  entity: string | null;
  entity_id: string | null;
  actor_id: string | null;
  actor_label?: string | null;
  invoice_number?: string | null;
  meta: any;
  state_code: string | null;
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/control-room/audit");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Audit load failed");
        setRows(json.rows ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (!actionFilter.trim()) return true;
    return (r.action ?? "").toLowerCase().includes(actionFilter.toLowerCase());
  });

  if (loading) return <div className="p-6">Cargando auditoría…</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Auditoría del sistema</h1>

      <div className="flex items-center gap-3">
        <input
          className="border rounded px-3 py-1 text-sm"
          placeholder="Filtrar por acción…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <div className="text-xs opacity-60">
          {filtered.length} / {rows.length} eventos
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* TAULA */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/5">
              <tr className="text-left">
                <th className="p-2">Fecha</th>
                <th className="p-2">Acción</th>
                <th className="p-2">Factura</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t cursor-pointer hover:bg-black/5"
                  onClick={() => setSelected(r)}
                >
                  <td className="p-2 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-2">{r.action ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">
                    {r.invoice_number ?? "—"}
                  </td>
                  <td className="p-2">{r.status ?? "—"}</td>
                </tr>
              ))}

              {filtered.length === 0 ? (
                <tr className="border-t">
                  <td className="p-3 text-sm opacity-60" colSpan={4}>
                    Sin eventos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* INSPECTOR */}
        <div className="border rounded-lg p-3 text-sm">
          {!selected ? (
            <div className="opacity-50">Selecciona un evento…</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs opacity-50">
                {new Date(selected.created_at).toLocaleString()}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <strong>{selected.action}</strong>
                </div>
                <div className="text-xs opacity-60">
                  Actor: {selected.actor_label ?? "—"}
                </div>
              </div>

              <div className="text-xs opacity-60">
                Entidad: {selected.entity ?? "—"} · entity_id:{" "}
                <span className="font-mono">{selected.entity_id ?? "—"}</span>
              </div>

              <div className="text-xs opacity-60">
                Factura: <span className="font-mono">{selected.invoice_number ?? "—"}</span>
              </div>

              <pre className="text-xs bg-black/5 p-2 rounded overflow-auto">
                {JSON.stringify(selected.meta, null, 2)}
              </pre>

              {selected.entity === "invoice" && !selected.invoice_number ? (
                <div className="text-xs text-red-500">
                  Aquest event NO porta invoice_number ni entity_id resoluble.
                  Cal log canònic: entity_id (invoice uuid) i/o meta.invoice_number.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
