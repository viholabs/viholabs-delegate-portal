"use client";

// src/components/control-room/technical/blocks/Z2HoldedInvoicesRuntime.tsx

import { useEffect, useMemo, useState } from "react";

type HoldedInvoice = {
  holded_id: string | null;
  number: string | null;
  date: string | null; // YYYY-MM-DD (o ISO)
  status: string | null;
  total: number | null;
  currency: string | null;
  contact_name: string | null;
};

function safeLower(v: any) {
  return String(v ?? "").toLowerCase();
}

function monthKeyFromISODate(d: string | null): string {
  if (!d) return "— Sense data —";
  const m = String(d).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : "— Sense data —";
}

function fmtMoney(n: number | null | undefined, currency: string = "EUR") {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n);
  } catch {
    return String(n);
  }
}

export default function Z2HoldedInvoicesRuntime() {
  const [open, setOpen] = useState(false);

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [items, setItems] = useState<HoldedInvoice[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  async function loadPage(p: number, replace: boolean) {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL("/api/holded/invoices", window.location.origin);
      url.searchParams.set("page", String(p));

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "include",
        cache: "no-store",
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Holded error ${res.status}`);

      const list: HoldedInvoice[] = Array.isArray(j?.invoices)
        ? j.invoices.map((x: any) => ({
            holded_id: x?.holded_id ? String(x.holded_id) : null,
            number: x?.number ? String(x.number) : null,
            date: x?.date ? String(x.date) : null,
            status: x?.status ? String(x.status) : null,
            total: x?.total ?? null,
            currency: x?.currency ? String(x.currency) : "EUR",
            contact_name: x?.contact_name ? String(x.contact_name) : null,
          }))
        : [];

      setItems((prev) => (replace ? list : [...prev, ...list]));
      setPage(p);
      setHasMore(list.length > 0);
      if (replace) setExpandedMonths({});
    } catch (e: any) {
      setErr(e?.message ?? "Error carregant factures de Holded");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  async function reload() {
    setItems([]);
    setPage(1);
    setHasMore(true);
    await loadPage(1, true);
  }

  // Carrega automàticament quan obris el bloc (no abans)
  useEffect(() => {
    if (!open) return;
    if (items.length > 0) return;
    void loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const qx = safeLower(q).trim();
    if (!qx) return items;
    return items.filter((r) => {
      return (
        safeLower(r.number).includes(qx) ||
        safeLower(r.contact_name).includes(qx) ||
        safeLower(r.holded_id).includes(qx) ||
        safeLower(r.status).includes(qx) ||
        safeLower(r.date).includes(qx)
      );
    });
  }, [items, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, HoldedInvoice[]>();
    for (const r of filtered) {
      const mk = monthKeyFromISODate(r.date);
      if (!map.has(mk)) map.set(mk, []);
      map.get(mk)!.push(r);
    }

    const months = Array.from(map.keys()).sort((a, b) => {
      if (a === "— Sense data —") return 1;
      if (b === "— Sense data —") return -1;
      return b.localeCompare(a); // desc
    });

    return months.map((m) => {
      const list = (map.get(m) ?? []).slice().sort((a, b) => safeLower(b.date).localeCompare(safeLower(a.date)));
      const total = list.reduce((acc, x) => acc + (Number(x.total) || 0), 0);
      return { month: m, list, total };
    });
  }, [filtered]);

  function isMonthOpen(m: string) {
    // per defecte: tot plegat (tu obres)
    return !!expandedMonths[m];
  }

  function toggleMonth(m: string) {
    setExpandedMonths((prev) => ({ ...prev, [m]: !prev[m] }));
  }

  return (
    <section className="rounded-2xl border p-3" style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-muted)" }}>
            HOLDed — FACTURES (RUNTIME)
          </div>
          <div className="text-xs font-semibold" style={{ color: "var(--viho-primary)" }}>
            {open ? "Ocultar" : "Ver"}
          </div>
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
          Lectura directa del motor extern. Agrupació per mesos. Cerca.
        </div>
      </button>

      {open ? (
        <div className="mt-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <input
                className="h-9 w-[360px] max-w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--viho-border)" }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca: número, client, id, status, data…"
              />
              <button
                type="button"
                className="h-9 rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--viho-border)", color: "var(--viho-primary)" }}
                onClick={() => setQ("")}
                disabled={loading}
              >
                Netejar
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="h-9 rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--viho-border)", color: "var(--viho-primary)" }}
                onClick={reload}
                disabled={loading}
              >
                {loading ? "Carregant…" : "Recarregar"}
              </button>

              <button
                type="button"
                className="h-9 rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--viho-border)", color: hasMore ? "var(--viho-primary)" : "var(--viho-muted)" }}
                onClick={() => loadPage(page + 1, false)}
                disabled={loading || !hasMore}
                title={!hasMore ? "No hi ha més pàgines (última pàgina buida)" : ""}
              >
                {loading ? "Carregant…" : `Carregar més (p.${page + 1})`}
              </button>
            </div>
          </div>

          {err ? (
            <div className="mt-3 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--viho-border)", color: "var(--viho-warning)" }}>
              {err}
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {grouped.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--viho-muted)" }}>
                {loading ? "Carregant…" : "Sense factures (o no coincideixen amb la cerca)."}
              </div>
            ) : (
              grouped.map((g) => (
                <div key={g.month} className="rounded-xl border" style={{ borderColor: "var(--viho-border)" }}>
                  <button
                    type="button"
                    onClick={() => toggleMonth(g.month)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--viho-text)" }}>
                        {g.month}
                      </div>
                      <div className="text-xs" style={{ color: "var(--viho-muted)" }}>
                        {g.list.length} factures · total aprox:{" "}
                        <span style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
                          {fmtMoney(g.total, "EUR")}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs font-semibold" style={{ color: "var(--viho-primary)" }}>
                      {isMonthOpen(g.month) ? "Ocultar" : "Ver"}
                    </div>
                  </button>

                  {isMonthOpen(g.month) ? (
                    <div className="border-t px-3 py-3" style={{ borderColor: "var(--viho-border)" }}>
                      <div className="space-y-2">
                        {g.list.map((r, idx) => (
                          <div
                            key={`${r.holded_id ?? "noid"}_${idx}`}
                            className="rounded-xl border px-3 py-2"
                            style={{ borderColor: "var(--viho-border)" }}
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="text-sm font-semibold" style={{ color: "var(--viho-text)" }}>
                                {r.number ?? "—"}
                              </div>
                              <div className="text-xs" style={{ color: "var(--viho-muted)", whiteSpace: "nowrap" }}>
                                {r.date ? String(r.date).slice(0, 10) : "—"}
                              </div>
                            </div>

                            <div className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
                              {r.contact_name ?? "—"} · {r.status ?? "—"}
                            </div>

                            <div className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
                              Total:{" "}
                              <span style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
                                {fmtMoney(r.total, r.currency ?? "EUR")}
                              </span>
                              {" · "}
                              <span className="font-mono" style={{ color: "var(--viho-muted)" }}>
                                {r.holded_id ?? "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
