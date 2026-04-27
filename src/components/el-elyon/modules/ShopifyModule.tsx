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

type OrderDetail = {
  order: ShopifyOrderRow & { raw: any };
  client: { id: string; name: string | null; contact_email: string | null; status: string | null } | null;
  holded_invoices: {
    id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    total_net: number | null;
    total_gross: number | null;
    is_paid: boolean;
    paid_date: string | null;
    external_invoice_id: string | null;
    document_type: string | null;
  }[];
  email_candidates: { id: string; name: string | null; contact_email: string | null; status: string | null }[];
};

const FS_COLORS: Record<string, { bg: string; fg: string }> = {
  paid: { bg: "rgba(6,95,70,0.1)", fg: "#065f46" },
  pending: { bg: "rgba(146,64,14,0.1)", fg: "#92400e" },
  refunded: { bg: "rgba(107,114,128,0.1)", fg: "#6b7280" },
  voided: { bg: "rgba(107,114,128,0.1)", fg: "#6b7280" },
  partially_paid: { bg: "rgba(217,119,6,0.1)", fg: "#d97706" },
};

function fmt(n: number | string | null | undefined) {
  if (n == null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return String(n);
  return num.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function OrderDetailPanel({ rowId, orderEmail }: { rowId: string; orderEmail: string | null }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/el-elyon/shopify/orders/${rowId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setDetail(d);
        else setError(d.error ?? "Error");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [rowId]);

  if (loading) return <div style={{ fontSize: 11, opacity: 0.6, padding: "8px 0" }}>Cargando detalle…</div>;
  if (error) return <div style={{ fontSize: 11, color: "#b91c1c", padding: "8px 0" }}>{error}</div>;
  if (!detail) return null;

  const raw = detail.order.raw ?? {};
  const lineItems: any[] = raw.line_items ?? [];
  const shipping = raw.shipping_address;
  const note = raw.note;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8, borderTop: "1px solid rgba(0,0,0,0.07)" }}>

      {/* Client match */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.5, marginBottom: 4 }}>Cliente Viholabs</div>
        {detail.client ? (
          <div style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, background: "rgba(6,95,70,0.07)", border: "1px solid rgba(6,95,70,0.15)" }}>
            <span style={{ fontWeight: 700, color: "#065f46" }}>{detail.client.name}</span>
            <span style={{ opacity: 0.65 }}> · {detail.client.contact_email} · {detail.client.status}</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, background: "rgba(185,28,28,0.05)", border: "1px solid rgba(185,28,28,0.12)" }}>
            <span style={{ color: "#b91c1c", fontWeight: 600 }}>Sin cliente vinculado</span>
            <span style={{ opacity: 0.65 }}> — email del pedido: {orderEmail ?? "—"}</span>
            {detail.email_candidates.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                Posibles matches: {detail.email_candidates.map((c) => (
                  <span key={c.id} style={{ marginRight: 6, background: "rgba(0,0,0,0.06)", borderRadius: 4, padding: "1px 5px" }}>{c.name} ({c.contact_email})</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Holded invoices */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.5, marginBottom: 4 }}>
          Facturas Holded (±21 días)
        </div>
        {detail.holded_invoices.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {detail.client ? "Sin facturas en ese período." : "Necesita cliente vinculado para buscar facturas."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {detail.holded_invoices.map((inv) => (
              <div key={inv.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, padding: "5px 8px", borderRadius: 6, background: inv.is_paid ? "rgba(6,95,70,0.05)" : "rgba(146,64,14,0.05)", border: `1px solid ${inv.is_paid ? "rgba(6,95,70,0.12)" : "rgba(146,64,14,0.12)"}` }}>
                <span style={{ fontWeight: 700, minWidth: 90 }}>{inv.invoice_number ?? inv.external_invoice_id ?? "—"}</span>
                <span style={{ opacity: 0.65 }}>{fmtDate(inv.invoice_date)}</span>
                <span style={{ fontWeight: 600 }}>{fmt(inv.total_net)} € neto</span>
                <span style={{ opacity: 0.65 }}>({fmt(inv.total_gross)} € bruto)</span>
                <span style={{ marginLeft: "auto", padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontSize: 10, background: inv.is_paid ? "rgba(6,95,70,0.1)" : "rgba(146,64,14,0.1)", color: inv.is_paid ? "#065f46" : "#92400e" }}>
                  {inv.is_paid ? `Cobrada ${fmtDate(inv.paid_date)}` : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.5, marginBottom: 4 }}>Productos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {lineItems.map((item: any) => (
              <div key={item.id} style={{ display: "flex", gap: 8, fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <span style={{ flex: 1 }}>{item.title}</span>
                {item.sku && <span style={{ opacity: 0.5 }}>SKU {item.sku}</span>}
                <span style={{ opacity: 0.7 }}>×{item.quantity}</span>
                <span style={{ fontWeight: 600 }}>{fmt(parseFloat(item.price))} {detail.order.currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shipping + note */}
      {(shipping || note) && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {shipping && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.5, marginBottom: 2 }}>Envío</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>
                {[shipping.first_name, shipping.last_name].filter(Boolean).join(" ")}
                {shipping.phone && ` · ${shipping.phone}`}
                {shipping.country_code && ` · ${shipping.country_code}`}
              </div>
            </div>
          )}
          {note && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.5, marginBottom: 2 }}>Nota</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{note}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShopifyModule({ shopifyConfigured }: { shopifyConfigured?: boolean }) {
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [orders, setOrders] = useState<ShopifyOrderRow[]>([]);
  const [configured, setConfigured] = useState(shopifyConfigured ?? false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ upserted: number; errors: number; client_matches: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const text = await r.text();
      let d: any;
      try { d = JSON.parse(text); } catch {
        setSyncError(`HTTP ${r.status}: ${text.slice(0, 300)}`);
        return;
      }
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
              <KpiChip label="Sin match email" value={summary.unmatched_orders} warn={summary.unmatched_orders > 0} />
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
            <div style={{ fontSize: 12, opacity: 0.75 }}>Shopify no configurado. Añade las variables al servidor:</div>
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
              { label: "Con cliente Viholabs", value: summary.matched_clients },
              { label: "Email sin match", value: summary.unmatched_orders, warn: summary.unmatched_orders > 0 },
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

      <Subcard title={`Últimos pedidos (${orders.length})`} defaultOpen>
        {orders.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>{loading ? "Cargando…" : configured ? "Sin pedidos. Ejecuta un sync." : "Shopify no configurado."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 480, overflowY: "auto" }}>
            {orders.map((o) => {
              const sc = FS_COLORS[o.financial_status] ?? { bg: "rgba(0,0,0,0.04)", fg: "#6b7280" };
              const rowId = String(o.id);
              const isExpanded = expandedId === rowId;
              return (
                <div key={rowId} style={{ borderRadius: 8, background: "rgba(255,255,255,0.7)", border: `1px solid ${isExpanded ? "rgba(90,46,58,0.25)" : "rgba(0,0,0,0.08)"}`, overflow: "hidden" }}>
                  {/* Row — clickable */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : rowId)}
                    style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", cursor: "pointer", color: "#2d2d2d" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{o.order_name}</span>
                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: sc.bg, color: sc.fg, fontWeight: 600 }}>{o.financial_status}</span>
                        {o.fulfillment_status && (
                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(0,0,0,0.05)", color: "#6b7280", fontWeight: 600 }}>{o.fulfillment_status}</span>
                        )}
                      </div>
                      {o.client_name ? (
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#065f46", marginTop: 2 }}>
                          {o.client_name}
                          <span style={{ fontWeight: 400, color: "#555" }}> · {o.email}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
                          {o.email ?? "sin email"} — sin match
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{fmtDate(o.processed_at)}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{fmt(o.total_price)} {o.currency}</div>
                      {o.discount_codes && o.discount_codes.length > 0 && (
                        <div style={{ fontSize: 10, color: "#888" }}>{o.discount_codes.map((d) => d.code).join(", ")}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "0 10px 10px" }}>
                      <OrderDetailPanel rowId={rowId} orderEmail={o.email} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Subcard>

      <Subcard title="Sobre el matching de clientes">
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          El sync une pedidos Shopify a clientes Viholabs por <strong>coincidencia exacta de email</strong>.
          Si un pedido aparece como "email sin match", significa que ese email no existe en la tabla de clientes
          de Viholabs (aunque el cliente sí esté en Holded). Para vincularlo, asegúrate de que el cliente
          tenga el mismo email en Viholabs que usó en Shopify.
          {summary && summary.unmatched_orders > 0 && (
            <span style={{ color: "#b91c1c", display: "block", marginTop: 4 }}>
              {summary.unmatched_orders} pedido(s) sin match — haz clic en cada uno para ver candidatos.
            </span>
          )}
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
