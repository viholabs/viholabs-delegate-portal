//src/components/control-room/technical/blocks/Z2PipelinesLive.tsx <<'TS'
"use client";

/**
 * VIHOLABS — Z2.1 HOLDed Invoices + Detail Drawer (LOCAL TRUTH + ITEMS)
 *
 * Canon:
 * - READ ONLY
 * - No HOLDed API calls
 * - No schema changes
 */

import { useEffect, useMemo, useState } from "react";

type Row = {
  invoice_id: string | null;
  invoice_number: string | null;
  client_name: string | null;
  invoice_date: string | null; // ISO date
  invoice_month: string | null; // YYYY-MM
  imported_at: string | null;
};

type InvoiceDetail = {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  external_invoice_id: string | null;
  currency: string | null;
  total_gross: number | null;
  created_at: string | null;
  source_month: string | null;
  source_meta: any;
};

type ItemKind = "SALE" | "PROMO" | "NEUTRAL" | "DISCOUNT";

type InvoiceItem = {
  id: string;
  line_type: string | null;
  kind: ItemKind;
  units: number | null;
  description: string | null;
  unit_net_price: number | null;
  line_net_amount: number | null;
  vat_rate: number | null;
  line_vat_amount: number | null;
  line_gross_amount: number | null;
  created_at: string | null;
};

type DrawerPayload = {
  ok: boolean;
  invoice?: InvoiceDetail;
  items?: InvoiceItem[];
  units?: { sold: number; promo: number; discount: number; neutral: number };
  items_error?: string;
  error?: string;
};

function currentMonthKeyUTC(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonthKey(yyyyMm: string, deltaMonths: number): string {
  const [yStr, mStr] = yyyyMm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + deltaMonths);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function fmtDateHuman(isoLike: string | null | undefined): string {
  if (!isoLike) return "—";
  const s = String(isoLike).trim();
  const d10 = s.length >= 10 ? s.slice(0, 10) : s;
  const m = d10.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d10;
  const [, yyyy, mm, dd] = m;
  return `${dd}-${mm}-${yyyy}`;
}

function badgeForKind(kind: ItemKind) {
  if (kind === "SALE") return { text: "VENDA", subtle: false };
  if (kind === "PROMO") return { text: "PROMO", subtle: true };
  if (kind === "DISCOUNT") return { text: "DESCOMPTE", subtle: false };
  return { text: "NEUTRAL", subtle: true };
}

export default function Z2PipelinesLive() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const currentMonth = currentMonthKeyUTC();
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerInvoice, setDrawerInvoice] = useState<InvoiceDetail | null>(null);
  const [drawerItems, setDrawerItems] = useState<InvoiceItem[]>([]);
  const [drawerUnits, setDrawerUnits] =
    useState<{ sold: number; promo: number; discount: number; neutral: number } | null>(null);
  const [drawerItemsError, setDrawerItemsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/holded/imported", {
          headers: { Authorization: "Bearer 3040V1H0lb54376Quyriux" },
        });

        const text = await res.text();
        if (!text) throw new Error("Empty response");

        const json = JSON.parse(text);
        if (!json?.ok) throw new Error(json?.error || "Failed");

        if (!cancelled) {
          setRows((json.rows ?? []) as Row[]);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      }
    }

    run();
    const id = setInterval(run, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const monthOptions = useMemo(() => {
    const present = new Set<string>();
    for (const r of rows) if (r.invoice_month) present.add(r.invoice_month);

    let minMonth = currentMonth;
    for (const mk of present) if (mk < minMonth) minMonth = mk;

    const opts: Array<{ value: string; label: string }> = [];
    const MAX_MONTHS = 24;

    for (let i = 0; i < MAX_MONTHS; i++) {
      const value = shiftMonthKey(currentMonth, -i);
      const mustKeepAtLeast = i <= 5;
      if (!mustKeepAtLeast && value < minMonth) break;

      opts.push({
        value,
        label: i === 0 ? `En curs (${value})` : `En curs - ${i} (${value})`,
      });
    }

    return opts;
  }, [rows, currentMonth]);

  useEffect(() => {
    if (!monthOptions.find((o) => o.value === selectedMonth)) {
      setSelectedMonth(currentMonth);
    }
  }, [monthOptions, selectedMonth, currentMonth]);

  const visibleRows = useMemo(() => {
    return rows
      .filter((r) => r.invoice_month === selectedMonth)
      .slice()
      .sort((a, b) => String(b.invoice_number ?? "").localeCompare(String(a.invoice_number ?? "")));
  }, [rows, selectedMonth]);

  async function openDrawer(invoiceId: string) {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerError(null);
    setDrawerItemsError(null);
    setDrawerInvoice(null);
    setDrawerItems([]);
    setDrawerUnits(null);

    try {
      const res = await fetch(`/api/holded/invoices/${encodeURIComponent(invoiceId)}`, {
        headers: { Authorization: "Bearer 3040V1H0lb54376Quyriux" },
      });

      const text = await res.text();
      if (!text) throw new Error("Empty response");

      const json = JSON.parse(text) as DrawerPayload;
      if (!json?.ok) throw new Error(json?.error || "Drawer fetch failed");

      setDrawerInvoice((json.invoice ?? null) as any);
      setDrawerItems((json.items ?? []) as any);
      setDrawerUnits((json.units ?? null) as any);
      setDrawerItemsError(json.items_error ?? null);
    } catch (e: any) {
      setDrawerError(String(e?.message ?? e));
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold" style={{ color: "var(--viho-muted)" }}>
          Holded (Z2.1) · Factures (per data factura)
        </div>

        <select
          className="text-xs rounded-xl border px-2 py-1"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="text-xs" style={{ color: "var(--viho-danger)" }}>
          {error}
        </div>
      ) : (
        <div className="text-xs" style={{ color: "var(--viho-muted)" }}>
          Factures: <span className="font-semibold">{visibleRows.length}</span>
        </div>
      )}

      <div className="space-y-1">
        {visibleRows.map((r) => (
          <button
            key={r.invoice_id ?? `${r.invoice_number}-${r.imported_at}`}
            type="button"
            onClick={() => r.invoice_id && openDrawer(r.invoice_id)}
            className="w-full text-left rounded-2xl border px-3 py-2"
            style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
            disabled={!r.invoice_id}
          >
            <div className="text-xs">
              <span className="font-semibold">{r.invoice_number ?? "—"}</span>
              {" · "}
              <span>{r.client_name ?? "—"}</span>
              {" · "}
              <span className="font-semibold">{fmtDateHuman(r.invoice_date)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Drawer */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          style={{ background: "rgba(0,0,0,0.18)" }}
          onClick={closeDrawer}
        >
          <div
            className="w-full max-w-xl h-full overflow-auto p-4"
            style={{ background: "white" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold" style={{ color: "var(--viho-muted)" }}>
                INVOICE DETAIL (LOCAL TRUTH)
              </div>
              <button
                className="text-xs font-semibold rounded-xl border px-3 py-1"
                style={{ borderColor: "var(--viho-border)" }}
                onClick={closeDrawer}
              >
                Tancar
              </button>
            </div>

            {drawerLoading ? (
              <div className="mt-4 text-sm">Carregant…</div>
            ) : drawerError ? (
              <div className="mt-4 text-sm" style={{ color: "var(--viho-danger)" }}>
                {drawerError}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm font-semibold">Factura</div>
                  <div className="mt-1 text-sm">
                    {drawerInvoice?.invoice_number ?? "—"} · {drawerInvoice?.client_name ?? "—"}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold">ITEMS</div>
                  {drawerItemsError ? (
                    <div className="mt-1 text-sm" style={{ color: "var(--viho-danger)" }}>
                      {drawerItemsError}
                    </div>
                  ) : drawerItems.length === 0 ? (
                    <div className="mt-1 text-sm" style={{ color: "var(--viho-muted)" }}>
                      Sense items.
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {drawerItems.map((it) => {
                        const b = badgeForKind(it.kind);
                        return (
                          <div
                            key={it.id}
                            className="rounded-2xl border p-3"
                            style={{ borderColor: "var(--viho-border)" }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold">{it.description ?? "—"}</div>
                              <div
                                className="text-xs font-semibold px-2 py-1 rounded-full"
                                style={{
                                  border: "1px solid var(--viho-border)",
                                  background: b.subtle ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.06)",
                                  color: "var(--viho-muted)",
                                }}
                              >
                                {b.text}
                              </div>
                            </div>

                            <div className="mt-2 text-xs" style={{ color: "var(--viho-muted)" }}>
                              Unitats (venda / promo): <span className="font-semibold">{it.units ?? 0}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}