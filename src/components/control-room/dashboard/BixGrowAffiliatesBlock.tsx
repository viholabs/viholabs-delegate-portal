"use client";

import { useEffect, useMemo, useState } from "react";

type AttributedClient = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
};

type Liquidation = {
  amount: number;
  state_code: string;
  period_from: string;
  period_to: string;
  paid_at: string | null;
};

type AffiliateStats = {
  total_events: number;
  total_clients: number;
  total_sales: number;
  total_commission: number;
  total_liquidated: number;
  pending_liquidation: number;
};

type Affiliate = {
  id: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
  referral_code: string | null;
  state_code: string | null;
  source: string | null;
  commission_value: number | null;
  commission_type: string | null;
  synced_at: string | null;
  stats: AffiliateStats;
  clients: AttributedClient[];
  liquidations: Liquidation[];
};

type AffiliatesResponse = {
  ok: boolean;
  affiliates?: Affiliate[];
  error?: string;
};

function fmt(n: number) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES");
}

function statePill(state: string | null) {
  const s = (state ?? "").toUpperCase();
  let bg = "rgba(107,114,128,0.12)";
  let color = "#374151";
  if (s === "OPEN" || s === "ACTIVE") { bg = "rgba(5,150,105,0.12)"; color = "#065f46"; }
  else if (s === "PENDING") { bg = "rgba(217,119,6,0.12)"; color = "#92400e"; }
  else if (s === "PAID") { bg = "rgba(37,99,235,0.12)"; color = "#1e3a8a"; }
  else if (s === "CLOSED") { bg = "rgba(107,114,128,0.12)"; color = "#6b7280"; }
  return { bg, color, label: s || "—" };
}

function AffiliateRow({ aff }: { aff: Affiliate }) {
  const [expanded, setExpanded] = useState(false);
  const s = aff.stats;

  return (
    <div style={rowCard}>
      <div
        style={rowHeader}
        onClick={() => setExpanded((p) => !p)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((p) => !p)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <div style={rowName}>{aff.name || aff.email || aff.affiliate_external_id || "—"}</div>
          <div style={rowMeta}>
            {aff.email && <span>{aff.email}</span>}
            {aff.referral_code && <span>código: {aff.referral_code}</span>}
            {aff.affiliate_external_id && <span>BixGrow ID: {aff.affiliate_external_id}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {(() => { const p = statePill(aff.state_code); return (
              <span style={{ ...pill, background: p.bg, color: p.color }}>{p.label}</span>
            ); })()}
            {s.pending_liquidation > 0 && (
              <span style={{ ...pill, background: "rgba(217,119,6,0.12)", color: "#92400e" }}>
                pendiente {fmt(s.pending_liquidation)} €
              </span>
            )}
          </div>
          <span style={chevron}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={expandedBody}>
          {/* Stats grid */}
          <div style={statsGrid}>
            <StatCell label="Ventas totales" value={`${fmt(s.total_sales)} €`} />
            <StatCell label="Comisión total" value={`${fmt(s.total_commission)} €`} />
            <StatCell label="Liquidado" value={`${fmt(s.total_liquidated)} €`} />
            <StatCell label="Pendiente" value={`${fmt(s.pending_liquidation)} €`} highlight={s.pending_liquidation > 0} />
            <StatCell label="Eventos" value={String(s.total_events)} />
            <StatCell label="Clientes" value={String(s.total_clients)} />
          </div>

          {/* Commission info */}
          {(aff.commission_value != null || aff.commission_type) && (
            <div style={infoRow}>
              <span style={infoLabel}>Comisión:</span>
              <span style={infoVal}>
                {aff.commission_value != null ? `${aff.commission_value}` : "—"}
                {aff.commission_type ? ` (${aff.commission_type})` : ""}
              </span>
            </div>
          )}
          {aff.synced_at && (
            <div style={infoRow}>
              <span style={infoLabel}>Sincronizado:</span>
              <span style={infoVal}>{fmtDate(aff.synced_at)}</span>
            </div>
          )}

          {/* Attributed clients */}
          {aff.clients.length > 0 && (
            <div style={section}>
              <div style={sectionTitle}>Clientes atribuidos ({aff.clients.length})</div>
              <div style={clientList}>
                {aff.clients.map((c) => (
                  <div key={c.id} style={clientChip}>
                    <span style={clientName}>{c.name || c.email || c.id}</span>
                    {c.status && (
                      <span style={{ ...pill, ...(() => { const p = statePill(c.status); return { background: p.bg, color: p.color }; })() }}>
                        {c.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liquidations */}
          {aff.liquidations.length > 0 && (
            <div style={section}>
              <div style={sectionTitle}>Liquidaciones ({aff.liquidations.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {aff.liquidations.map((l, i) => {
                  const p = statePill(l.state_code);
                  return (
                    <div key={i} style={liquidRow}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(l.amount)} €</span>
                        <span style={{ ...pill, background: p.bg, color: p.color }}>{p.label}</span>
                        <span style={muted}>{fmtDate(l.period_from)} – {fmtDate(l.period_to)}</span>
                      </div>
                      {l.paid_at && <div style={muted}>Pagado: {fmtDate(l.paid_at)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {aff.liquidations.length === 0 && (
            <div style={muted}>Sin liquidaciones registradas.</div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={statCell}>
      <div style={{ ...statVal, color: highlight ? "#92400e" : "inherit" }}>{value}</div>
      <div style={statLabel}>{label}</div>
    </div>
  );
}

export default function BixGrowAffiliatesBlock() {
  const [data, setData] = useState<AffiliatesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        const res = await fetch("/api/control-room/bixgrow-affiliates", { cache: "no-store" });
        const json = (await res.json()) as AffiliatesResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ ok: false, error: "Error cargando afiliados." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  const affiliates = useMemo(() => data?.affiliates ?? [], [data]);

  const totals = useMemo(() => {
    return affiliates.reduce(
      (acc, a) => ({
        sales: acc.sales + a.stats.total_sales,
        commission: acc.commission + a.stats.total_commission,
        pending: acc.pending + a.stats.pending_liquidation,
        clients: acc.clients + a.stats.total_clients,
      }),
      { sales: 0, commission: 0, pending: 0, clients: 0 }
    );
  }, [affiliates]);

  return (
    <div style={card}>
      <div style={eyebrow}>El-Elyon · BixGrow</div>
      <div style={title}>Afiliados BixGrow</div>

      {loading && <div style={muted}>Cargando…</div>}

      {!loading && data && !data.ok && (
        <div style={errorText}>{data.error || "Error."}</div>
      )}

      {!loading && data?.ok && affiliates.length === 0 && (
        <div style={muted}>Sin afiliados registrados.</div>
      )}

      {!loading && data?.ok && affiliates.length > 0 && (
        <>
          {/* Summary totals */}
          <div style={totalsRow}>
            <div style={totalChip}>
              <span style={totalVal}>{fmt(totals.sales)} €</span>
              <span style={totalLabel}>ventas</span>
            </div>
            <div style={totalChip}>
              <span style={totalVal}>{fmt(totals.commission)} €</span>
              <span style={totalLabel}>comisiones</span>
            </div>
            <div style={{ ...totalChip, ...(totals.pending > 0 ? { background: "rgba(217,119,6,0.1)", borderColor: "rgba(217,119,6,0.25)" } : {}) }}>
              <span style={{ ...totalVal, ...(totals.pending > 0 ? { color: "#92400e" } : {}) }}>{fmt(totals.pending)} €</span>
              <span style={totalLabel}>pendiente liquidar</span>
            </div>
            <div style={totalChip}>
              <span style={totalVal}>{affiliates.length}</span>
              <span style={totalLabel}>afiliados</span>
            </div>
            <div style={totalChip}>
              <span style={totalVal}>{totals.clients}</span>
              <span style={totalLabel}>clientes</span>
            </div>
          </div>

          <div style={affiliatesList}>
            {affiliates.map((aff) => (
              <AffiliateRow key={aff.id} aff={aff} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.28)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251,246,236,0.78)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.2,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
};

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: "#a61b1b",
};

const totalsRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const totalChip: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.07)",
  background: "rgba(255,255,255,0.55)",
};

const totalVal: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.1,
};

const totalLabel: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.7,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const affiliatesList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowCard: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.66)",
  overflow: "hidden",
};

const rowHeader: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: "10px 12px",
  cursor: "pointer",
  userSelect: "none",
};

const rowName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
};

const rowMeta: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  fontSize: 11,
  opacity: 0.7,
};

const chevron: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.5,
  marginTop: 2,
};

const pill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 7px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const expandedBody: React.CSSProperties = {
  borderTop: "1px solid rgba(0,0,0,0.05)",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 6,
};

const statCell: React.CSSProperties = {
  background: "rgba(0,0,0,0.03)",
  borderRadius: 8,
  padding: "6px 8px",
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

const statVal: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.1,
};

const statLabel: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.65,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const infoRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  fontSize: 12,
  alignItems: "baseline",
};

const infoLabel: React.CSSProperties = {
  opacity: 0.65,
  flexShrink: 0,
};

const infoVal: React.CSSProperties = {
  fontWeight: 600,
};

const section: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  opacity: 0.7,
};

const clientList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const clientChip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  padding: "4px 0",
};

const clientName: React.CSSProperties = {
  fontWeight: 600,
  flex: 1,
};

const liquidRow: React.CSSProperties = {
  background: "rgba(0,0,0,0.025)",
  borderRadius: 8,
  padding: "6px 8px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
