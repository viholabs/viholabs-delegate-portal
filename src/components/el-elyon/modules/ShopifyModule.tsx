"use client";

import { useEffect, useState, useCallback } from "react";
import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";

type OrderSummary = {
  total_orders: number;
  paid_orders: number;
  pending_orders: number;
  total_revenue: number;
  matched_clients: number;
  unmatched_orders: number;
};

type ShopifyOrderRow = {
  id: string;
  order_id: number;
  order_name: string;
  processed_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  email: string | null;
  total_price: number;
  currency: string;
  discount_codes: { code: string; amount: string }[] | null;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  paid: { bg: "rgba(6,95,70,0.1)", fg: "#065f46" },
  pending: { bg: "rgba(146,64,14,0.1)", fg: "#92400e" },
  refunded: { bg: "rgba(107,114,128,0.1)", fg: "#6b7280" },
  voided: { bg: "rgba(107,114,128,0.1)", fg: "#6b7280" },
  partially_paid: { bg: "rgba(217,119,6,0.1)", fg: "#d97706" },
};

function fmt(n: number) { return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(s: string) { return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); }

export default function ShopifyModule({ shopifyConfigured }: { shopifyConfigured?: boolean }) {
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [orders, setOrders] = useState<ShopifyOrderRow[]>([]);
  const [configured, setConfigured] = useState(shopifyConfigured ?? false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ upserted: number; errors: number; client_matches: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/el-elyon/shopify/orders?limit=50", { cache: "no-store" });
      const d = await r.json();
      if (d.ok) {
        setConfigured(d.configured);
        setSummary(d.summary);
        setOrders(d.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Also reflect prop changes from parent overview
  useEffect(() => {
    if (shopifyConfigured !== undefined) setConfigured(shopifyConfigured);
  }, [shopifyConfigured]);

  async function runSync(full = false) {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const r = await fetch("/api/el-elyon/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
      const d = await r.json();
      if (d.ok) {
        setSyncResult({ upserted: d.upserted, errors: d.errors, client_matches: d.client_matches });
        await loadData();
      } else {
        setSyncError(d.error ?? "Error desconocido");
      }
    } catch (e: unknown) {
      setSyncError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  const status: ModuleStatus = loading ? "loading" : !configured ? "empty" : (summary?.unmatched_orders ?? 0) > 0 ? "warning" : "ok";

  return (
    <ElElyonModuleCard
      icon="🛍️"
      title="Shopify Control"
      subtitle="Ventas · Atribución comercial · Conciliación Holded"
      status={status}
      kpis={
        <>
          <KpiChip label="Estado" value={configured ? "Conectado" : "No configurado"} warn={!configured} />
          {summary && (
            <>
              <KpiChip label="Pedidos" value={summary.total_orders} />
              <KpiChip label="Pagados" value={summary.paid_orders} />
              <KpiChip label="Ingresos" value={`${fmt(summary.total_revenue)} €`} />
              <KpiChip label="Sin match" value={summary.unmatched_orders} warn={summary.unmatched_orders > 0} />
            </>
          )}
        </>
      }
    >
      {/* Sync controls */}
      {configured && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => runSync(false)}
            disabled={syncing}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(90,46,58,0.3)", background: "rgba(90,46,58,0.07)", color: "#5a2e3a", fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? "Sincronizando…" : "↻ Sync incremental (7d)"}
          </button>
          <button
            onClick={() => runSync(true)}
            disabled={syncing}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(0,0,0,0.04)", color: "#374151", fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.6 : 1 }}
          >
            ↻ Full sync
          </button>
          {syncResult && (
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(6,95,70,0.1)", color: "#065f46", fontWeight: 600 }}>
              ✓ {syncResult.upserted} upserted · {syncResult.client_matches} matches
              {syncResult.errors > 0 && ` · ${syncResult.errors} errores`}
            </span>
          )}
          {syncError && (
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(185,28,28,0.1)", color: "#b91c1c", fontWeight: 600 }}>
              ✗ {syncError}
            </span>
          )}
        </div>
      )}

      <Subcard title="Resumen de pedidos" defaultOpen>
        {!configured ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Shopify no configurado. Añade las variables al servidor:
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11, background: "rgba(0,0,0,0.05)", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span>SHOPIFY_SHOP_DOMAIN=tu-tienda.myshopify.com</span>
              <span>SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxx</span>
              <span>SHOPIFY_API_VERSION=2026-01</span>
            </div>
          </div>
        ) : loading ? (
          <div style={{ fontSize: 12, opacity: 0.6 }}>Cargando…</div>
        ) : summary ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
            {[
              { label: "Total pedidos", value: summary.total_orders },
              { label: "Pagados", value: summary.paid_orders, ok: true },
              { label: "Pendientes", value: summary.pending_orders, warn: summary.pending_orders > 0 },
              { label: "Ingresos totales", value: `${fmt(summary.total_revenue)} €` },
              { label: "Con cliente", value: summary.matched_clients },
              { label: "Sin matching", value: summary.unmatched_orders, warn: summary.unmatched_orders > 0 },
            ].map((s) => (
              <div key={s.label} style={{ padding: "8px 10px", borderRadius: 8, background: s.warn ? "rgba(185,28,28,0.05)" : s.ok ? "rgba(6,95,70,0.05)" : "rgba(0,0,0,0.03)", border: `1px solid ${s.warn ? "rgba(185,28,28,0.15)" : "rgba(0,0,0,0.06)"}` }}>
                <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.warn ? "#b91c1c" : s.ok ? "#065f46" : "inherit" }}>{s.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6 }}>Sin datos. Ejecuta un sync primero.</div>
        )}
      </Subcard>

      <Subcard title={`Últimos pedidos (${orders.length})`}>
        {orders.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.6 }}>{configured ? "Sin pedidos. Ejecuta un sync." : "Shopify no configurado."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {orders.map((o) => {
              const sc = STATUS_COLORS[o.financial_status] ?? { bg: "rgba(0,0,0,0.04)", fg: "#6b7280" };
              return (
                <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.5)", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{o.order_name}</span>
                      <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: sc.bg, color: sc.fg, fontWeight: 600 }}>{o.financial_status}</span>
                      {o.fulfillment_status && (
                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(0,0,0,0.05)", color: "#6b7280", fontWeight: 600 }}>{o.fulfillment_status}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>
                      {o.email ?? "sin email"} · {fmtDate(o.processed_at)}
                    </div>
                    {o.client_name && (
                      <div style={{ fontSize: 11, color: "#065f46", marginTop: 1 }}>→ {o.client_name}</div>
                    )}
                    {!o.client_id && o.email && (
                      <div style={{ fontSize: 11, color: "#92400e", marginTop: 1 }}>Sin cliente vinculado</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{fmt(o.total_price)} {o.currency}</div>
                    {o.discount_codes && o.discount_codes.length > 0 && (
                      <div style={{ fontSize: 10, opacity: 0.6 }}>{o.discount_codes.map((d) => d.code).join(", ")}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Subcard>

      <Subcard title="Matching clientes y atribución">
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          El sync automático une pedidos por email a clientes Viholabs. La atribución comercial
          (afiliado BixGrow, recomendador, delegado) se calcula a partir del cliente vinculado.
          {summary && summary.unmatched_orders > 0 && (
            <span style={{ color: "#b91c1c", display: "block", marginTop: 4 }}>
              ⚠ {summary.unmatched_orders} pedidos sin cliente — ejecuta sync para re-intentar el matching.
            </span>
          )}
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
