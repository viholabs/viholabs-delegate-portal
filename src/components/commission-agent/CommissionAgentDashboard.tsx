"use client";

// CommissionAgentDashboard: vista específica para rol COMMISSION_AGENT / DISTRIBUTOR
// Muestra clientes atribuidos vía Bixgrow, cuentas de afiliado, comisiones e historial de conversiones.

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth/token";

type AffiliateAccount = {
  id: string;
  affiliate_id: string | null;
  platform: string | null;
  status: string | null;
};

type AttributedClient = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
};

type Commission = {
  id: string;
  month: string | null;
  amount: number | null;
  status: string | null;
};

type RecentEvent = {
  id: string;
  event_type: string | null;
  client_id: string | null;
  created_at: string;
};

type Summary = {
  actor: { id: string; name: string | null; email: string | null; role: string | null };
  has_delegate: boolean;
  affiliate_accounts: AffiliateAccount[];
  attributed_clients: AttributedClient[];
  stats: {
    total_conversions: number;
    attributed_clients_count: number;
    affiliate_accounts_count: number;
  };
  recent_events: RecentEvent[];
  commissions: Commission[];
  invoice_summary: { count: number; total_net: number };
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const getToken = getAccessToken;

export default function CommissionAgentDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/commission-agent/summary", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Error al cargar datos");
      setData(j as Summary);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: "var(--viho-muted)" }}>Cargando dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={() => void load()} className="mt-2 text-xs underline text-red-600">Reintentar</button>
      </div>
    );
  }

  if (!data) return null;

  const totalCommissions = data.commissions.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div
        className="rounded-[28px] border p-6"
        style={{
          borderColor: "var(--viho-border)",
          background: "radial-gradient(circle at top left, rgba(199,174,106,0.12) 0%, var(--viho-surface) 70%)",
        }}
      >
        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--viho-muted)" }}
          >
            Agente de Comisión
          </span>
          <h2 className="text-2xl font-semibold" style={{ color: "var(--viho-foreground)" }}>
            {data.actor.name ?? data.actor.email ?? "Mi cuenta"}
          </h2>
          {data.actor.email && data.actor.name && (
            <p className="text-sm" style={{ color: "var(--viho-muted)" }}>{data.actor.email}</p>
          )}
        </div>

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Cuentas de afiliado", value: data.stats.affiliate_accounts_count },
            { label: "Clientes atribuidos", value: data.stats.attributed_clients_count },
            { label: "Conversiones totales", value: data.stats.total_conversions },
            {
              label: "Comisiones cobradas",
              value: `${fmt(totalCommissions)} €`,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--viho-border)", background: "rgba(255,255,255,0.6)" }}
            >
              <div
                className="text-[11px] font-semibold uppercase tracking-wide mb-1"
                style={{ color: "var(--viho-muted)" }}
              >
                {kpi.label}
              </div>
              <div className="text-xl font-bold" style={{ color: "var(--viho-foreground)" }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Cuentas de afiliado */}
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
        >
          <h3
            className="text-xs font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--viho-muted)" }}
          >
            Cuentas de afiliado
          </h3>
          {data.affiliate_accounts.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--viho-muted)" }}>
              Sin cuentas de afiliado vinculadas. Contacta con el administrador para configurar tu cuenta Bixgrow.
            </p>
          ) : (
            <div className="space-y-2">
              {data.affiliate_accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-3"
                  style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)" }}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--viho-foreground)" }}>
                      {acc.affiliate_id ?? acc.id}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--viho-muted)" }}>
                      {acc.platform ?? "Bixgrow"}
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{
                      background: acc.status === "active" ? "#16a34a" : "#64748b",
                    }}
                  >
                    {acc.status ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clientes atribuidos */}
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
        >
          <h3
            className="text-xs font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--viho-muted)" }}
          >
            Clientes atribuidos
          </h3>
          {data.attributed_clients.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--viho-muted)" }}>
              Sin clientes atribuidos todavía. Los clientes aparecerán aquí cuando completen conversiones a través de tu enlace de afiliado.
            </p>
          ) : (
            <div className="space-y-2">
              {data.attributed_clients.slice(0, 8).map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-3"
                  style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)" }}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--viho-foreground)" }}>
                      {client.name ?? "Cliente sin nombre"}
                    </div>
                    {client.email && (
                      <div className="text-xs" style={{ color: "var(--viho-muted)" }}>
                        {client.email}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: client.status === "active" ? "#16a34a" : "var(--viho-muted)" }}
                  >
                    {client.status ?? "—"}
                  </span>
                </div>
              ))}
              {data.attributed_clients.length > 8 && (
                <p className="text-xs text-center pt-1" style={{ color: "var(--viho-muted)" }}>
                  +{data.attributed_clients.length - 8} más
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Comisiones */}
      {data.has_delegate && (
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--viho-muted)" }}
            >
              Historial de comisiones
            </h3>
            <div className="text-right">
              <div className="text-xs" style={{ color: "var(--viho-muted)" }}>Facturas pagadas</div>
              <div className="text-sm font-semibold" style={{ color: "var(--viho-foreground)" }}>
                {data.invoice_summary.count} · {fmt(data.invoice_summary.total_net)} €
              </div>
            </div>
          </div>
          {data.commissions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--viho-muted)" }}>Sin comisiones calculadas todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--viho-border)" }}>
                    {["Mes", "Importe", "Estado"].map((h) => (
                      <th
                        key={h}
                        className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--viho-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.commissions.map((c) => (
                    <tr
                      key={c.id}
                      style={{ borderBottom: "1px solid var(--viho-border)" }}
                    >
                      <td className="py-2.5" style={{ color: "var(--viho-foreground)" }}>
                        {c.month ? c.month.slice(0, 7) : "—"}
                      </td>
                      <td className="py-2.5 font-semibold" style={{ color: "var(--viho-foreground)" }}>
                        {c.amount != null ? `${fmt(c.amount)} €` : "—"}
                      </td>
                      <td className="py-2.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background:
                              c.status === "paid"
                                ? "rgba(22,163,74,0.12)"
                                : "rgba(100,116,139,0.12)",
                            color:
                              c.status === "paid" ? "#16a34a" : "var(--viho-muted)",
                          }}
                        >
                          {c.status ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Conversiones recientes */}
      {data.recent_events.length > 0 && (
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
        >
          <h3
            className="text-xs font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--viho-muted)" }}
          >
            Actividad reciente
          </h3>
          <div className="space-y-2">
            {data.recent_events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
                style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)" }}
              >
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: "#7c3aed" }}
                >
                  {ev.event_type ?? "evento"}
                </span>
                <span className="text-sm flex-1" style={{ color: "var(--viho-foreground)" }}>
                  {ev.client_id ? `Cliente: ${ev.client_id.slice(0, 8)}…` : "Evento sin cliente"}
                </span>
                <span className="text-xs shrink-0" style={{ color: "var(--viho-muted)" }}>
                  {formatDate(ev.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
