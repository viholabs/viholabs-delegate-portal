"use client";

// ViewAsDelegatePanel: permite a supervisores ver el dashboard de cualquier delegado
// sin impersonación real — usa el parámetro ?delegateId= que todos los endpoints ya soportan.

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth/token";

type DelegateOption = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
};

type DelegateSummary = {
  delegate: { id: string; name: string | null; email: string | null } | null;
  period: { month: string } | null;
  totals: {
    invoices_paid: number;
    invoices_unpaid: number;
    units_sale_paid: number;
    total_net_paid: number;
    total_net_unpaid: number;
  } | null;
  top_clients: Array<{ client: { id: string; name: string | null }; units_paid: number; revenue_net_paid: number }>;
  sleeping_clients: Array<{ client: { id: string; name: string | null }; days_since_last: number; severity: string }>;
};

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const getToken = getAccessToken;

export default function ViewAsDelegatePanel() {
  const [delegates, setDelegates] = useState<DelegateOption[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>("");
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<DelegateSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Load delegate list
  useEffect(() => {
    async function load() {
      setLoadingList(true);
      setListError(null);
      try {
        const token = await getToken();
        const res = await fetch("/api/control-room/delegates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ month: currentMonth() }),
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (!j?.ok) throw new Error(j?.error ?? "Error al cargar delegados");
        setDelegates(
          (j.delegates ?? []).map((d: any) => ({
            id: String(d.id),
            name: d.name ?? null,
            email: d.email ?? null,
            status: d.status ?? null,
          }))
        );
      } catch (e) {
        setListError(String(e));
      } finally {
        setLoadingList(false);
      }
    }
    void load();
  }, []);

  const loadSummary = useCallback(async (delegateId: string, targetMonth: string) => {
    if (!delegateId) return;
    setLoadingSummary(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/delegate/summary?delegateId=${delegateId}&month=${targetMonth}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        }
      );
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Error al cargar resumen");
      setSummary({
        delegate: j.delegate ?? null,
        period: j.period ?? null,
        totals: j.totals ?? null,
        top_clients: j.top_clients ?? [],
        sleeping_clients: j.sleeping_clients ?? [],
      });
    } catch (e) {
      setSummaryError(String(e));
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  function handleSelectDelegate(id: string) {
    setSelectedId(id);
    if (id) void loadSummary(id, month);
    else setSummary(null);
  }

  function handleMonthChange(m: string) {
    setMonth(m);
    if (selectedId) void loadSummary(selectedId, m);
  }

  const selectedDelegate = delegates.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      {/* Picker de delegado */}
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
      >
        <div className="mb-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--viho-muted)" }}
          >
            Seleccionar delegado
          </span>
          <p className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
            Ver los datos de cualquier delegado como si fueses él. Sin impersonación real — sólo lectura supervisada.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={selectedId}
            onChange={(e) => handleSelectDelegate(e.target.value)}
            disabled={loadingList}
            className="flex-1 rounded-xl border px-3 py-2 text-sm min-w-[200px]"
            style={{
              borderColor: "var(--viho-border)",
              background: "var(--viho-surface-2,#f9f7f4)",
              color: "var(--viho-foreground)",
            }}
          >
            <option value="">{loadingList ? "Cargando delegados…" : "— Selecciona un delegado —"}</option>
            {delegates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name ?? d.email ?? d.id}
                {d.status && d.status !== "active" ? ` (${d.status})` : ""}
              </option>
            ))}
          </select>

          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => handleMonthChange(e.target.value + "-01")}
            className="rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--viho-border)",
              background: "var(--viho-surface-2,#f9f7f4)",
              color: "var(--viho-foreground)",
            }}
          />

          {selectedId && (
            <button
              onClick={() => handleSelectDelegate("")}
              className="rounded-xl border px-3 py-2 text-sm transition hover:opacity-70"
              style={{ borderColor: "var(--viho-border)", color: "var(--viho-muted)" }}
            >
              Limpiar
            </button>
          )}
        </div>

        {listError && <p className="mt-2 text-sm text-red-600">{listError}</p>}
      </div>

      {/* Banner de modo vista */}
      {selectedDelegate && (
        <div
          className="flex items-center gap-3 rounded-2xl border px-5 py-3"
          style={{
            borderColor: "#c7ae6a",
            background: "rgba(199,174,106,0.10)",
          }}
        >
          <span
            className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{ background: "#c7ae6a" }}
          >
            Vista como
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--viho-foreground)" }}>
            {selectedDelegate.name ?? selectedDelegate.email ?? selectedDelegate.id}
          </span>
          {selectedDelegate.email && selectedDelegate.name && (
            <span className="text-xs" style={{ color: "var(--viho-muted)" }}>
              {selectedDelegate.email}
            </span>
          )}
          <a
            href={`/control-room/delegates/${selectedDelegate.id}`}
            className="ml-auto text-xs underline underline-offset-2 transition hover:opacity-70"
            style={{ color: "var(--viho-primary)" }}
          >
            Ver detalle completo →
          </a>
        </div>
      )}

      {/* Loading */}
      {loadingSummary && (
        <p className="text-sm" style={{ color: "var(--viho-muted)" }}>Cargando datos del delegado…</p>
      )}

      {/* Error */}
      {summaryError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {summaryError}
        </div>
      )}

      {/* Summary */}
      {summary && !loadingSummary && (
        <div className="space-y-4">
          {/* KPIs */}
          {summary.totals && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Facturas pagadas", value: summary.totals.invoices_paid },
                { label: "Facturas pendientes", value: summary.totals.invoices_unpaid },
                {
                  label: "Revenue neto pagado",
                  value: `${fmt(summary.totals.total_net_paid, 2)} €`,
                },
                {
                  label: "Revenue neto pendiente",
                  value: `${fmt(summary.totals.total_net_unpaid, 2)} €`,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--viho-muted)" }}>
                    {kpi.label}
                  </div>
                  <div className="text-xl font-bold" style={{ color: "var(--viho-foreground)" }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top clients */}
          {summary.top_clients.length > 0 && (
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
            >
              <h4 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--viho-muted)" }}>
                Top clientes
              </h4>
              <div className="space-y-2">
                {summary.top_clients.slice(0, 5).map((tc) => (
                  <div key={tc.client.id} className="flex items-center justify-between gap-4">
                    <span className="text-sm truncate" style={{ color: "var(--viho-foreground)" }}>
                      {tc.client.name ?? tc.client.id}
                    </span>
                    <div className="flex gap-4 shrink-0 text-right">
                      <span className="text-xs" style={{ color: "var(--viho-muted)" }}>
                        {tc.units_paid} ud
                      </span>
                      <span className="text-xs font-semibold" style={{ color: "var(--viho-foreground)" }}>
                        {fmt(tc.revenue_net_paid, 2)} €
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sleeping clients */}
          {summary.sleeping_clients.length > 0 && (
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
            >
              <h4 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--viho-muted)" }}>
                Clientes dormidos
              </h4>
              <div className="space-y-2">
                {summary.sleeping_clients.slice(0, 8).map((sc) => (
                  <div key={sc.client.id} className="flex items-center justify-between gap-4">
                    <span className="text-sm truncate" style={{ color: "var(--viho-foreground)" }}>
                      {sc.client.name ?? sc.client.id}
                    </span>
                    <div className="flex gap-3 shrink-0 items-center">
                      <span className="text-xs" style={{ color: "var(--viho-muted)" }}>
                        {sc.days_since_last}d sin actividad
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{
                          background: sc.severity === "critical" ? "#dc2626" : sc.severity === "risk" ? "#d97706" : "#64748b",
                        }}
                      >
                        {sc.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedId && !loadingList && delegates.length > 0 && (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
        >
          <p className="text-sm" style={{ color: "var(--viho-muted)" }}>
            Selecciona un delegado para ver sus datos en modo supervisión.
          </p>
        </div>
      )}
    </div>
  );
}
