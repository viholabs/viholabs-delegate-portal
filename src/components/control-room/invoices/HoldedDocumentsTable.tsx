"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import OrdersConsoleTab from "@/components/control-room/orders/OrdersConsoleTab";

type HoldedInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  client_id: string | null;
  client_name?: string | null;
  delegate_id: string | null;
  source_provider: string | null;
  external_invoice_id: string | null;
  holded_contact_id: string | null;
  state_code: string | null;
  source_month: string | null;
  total_net?: number | string | null;
  total_gross?: number | string | null;
  currency?: string | null;
  is_paid?: boolean | null;
  paid_date?: string | null;
};

type ApiResponse = {
  ok: boolean;
  month: string;
  count: number;
  rows: HoldedInvoiceRow[];
  error?: string;
};

type InvoiceDetail = {
  invoice: Record<string, any> | null;
  items: Array<Record<string, any>>;
  units?: {
    sold?: number;
    promo?: number;
    discount?: number;
    neutral?: number;
  } | null;
};

type InvoiceDetailResponse = {
  ok: boolean;
  stage?: string;
  invoice?: Record<string, any>;
  items?: Array<Record<string, any>>;
  units?: {
    sold?: number;
    promo?: number;
    discount?: number;
    neutral?: number;
  };
  items_error?: string;
  error?: string;
};

function safeText(value: string | null | undefined, fallback = "—") {
  if (!value || value.trim() === "") return fallback;
  return value;
}

function monthOptions(count = 18): string[] {
  const now = new Date();
  const list: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    list.push(`${yyyy}-${mm}`);
  }

  return list;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function sortRows(rows: HoldedInvoiceRow[]) {
  return [...rows].sort((a, b) => {
    const da = a.invoice_date ?? "";
    const db = b.invoice_date ?? "";
    if (da !== db) return db.localeCompare(da);

    const na = a.invoice_number ?? "";
    const nb = b.invoice_number ?? "";
    return nb.localeCompare(na);
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function money(value: unknown, currency = "EUR") {
  const amount = toNumber(value);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} €`;
  }
}

function fmtDate(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "—";
  return v;
}

function resolveInvoiceTotal(row: HoldedInvoiceRow) {
  if (row.total_gross != null) return toNumber(row.total_gross);
  if (row.total_net != null) return toNumber(row.total_net);
  return 0;
}

function lineName(item: Record<string, any>) {
  return safeText(
    typeof item?.name === "string"
      ? item.name
      : typeof item?.description === "string"
        ? item.description
        : null
  );
}

function lineSku(item: Record<string, any>) {
  return safeText(
    typeof item?.sku === "string"
      ? item.sku
      : typeof item?.product_sku === "string"
        ? item.product_sku
        : typeof item?.reference === "string"
          ? item.reference
          : null
  );
}

function unitsSale(item: Record<string, any>) {
  const kind = String(item?.kind ?? "").toUpperCase();
  if (kind === "SALE") return toNumber(item?.units);
  return 0;
}

function unitsPromo(item: Record<string, any>) {
  const kind = String(item?.kind ?? "").toUpperCase();
  if (kind === "PROMO") return toNumber(item?.units);
  return 0;
}

export default function HoldedDocumentsTable() {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth());
  const [selectedDelegateId, setSelectedDelegateId] = useState<string>("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HoldedInvoiceRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [selectedInvoiceRow, setSelectedInvoiceRow] = useState<HoldedInvoiceRow | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);

  const [invoicesCollapsed, setInvoicesCollapsed] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/control-room/invoices?month=${encodeURIComponent(selectedMonth)}`,
          { cache: "no-store" }
        );

        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load Holded invoices");
        }

        if (!cancelled) {
          setRows(Array.isArray(json.rows) ? json.rows : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  useEffect(() => {
    setSelectedDelegateId("all");
    setDrawerOpen(false);
    setSelectedInvoiceRow(null);
    setDetail(null);
    setDrawerError(null);
  }, [selectedMonth]);

  const months = useMemo(() => monthOptions(18), []);

  const delegateOptions = useMemo(() => {
    const ids = new Set<string>();

    for (const row of rows) {
      const delegateId = String(row.delegate_id ?? "").trim();
      if (delegateId) ids.add(delegateId);
    }

    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const base =
      selectedDelegateId === "all"
        ? rows
        : rows.filter((row) => row.delegate_id === selectedDelegateId);

    return sortRows(base);
  }, [rows, selectedDelegateId]);

  const stats = useMemo(() => {
    let totalAmount = 0;

    for (const row of filteredRows) {
      totalAmount += resolveInvoiceTotal(row);
    }

    return {
      total: filteredRows.length,
      totalAmount,
    };
  }, [filteredRows]);

  async function openInvoice(row: HoldedInvoiceRow) {
    setSelectedInvoiceRow(row);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerError(null);
    setDetail(null);

    try {
      const res = await fetch(`/api/holded/invoices/${encodeURIComponent(row.id)}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as InvoiceDetailResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo cargar el detalle de la factura");
      }

      setDetail({
        invoice: json.invoice ?? null,
        items: Array.isArray(json.items) ? json.items : [],
        units: json.units ?? null,
      });
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  const detailInvoice = detail?.invoice ?? null;
  const detailItems = Array.isArray(detail?.items) ? detail!.items : [];
  const detailCurrency = safeText(
    (detailInvoice?.currency as string | null | undefined) ??
      selectedInvoiceRow?.currency ??
      "EUR",
    "EUR"
  );

  return (
    <>
      <div className="space-y-6">
        <OrdersConsoleTab />

        <Card className="overflow-hidden rounded-[28px] border-[#d8c08a] bg-[#f5efe6] shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-[#d8c08a] px-6 py-5 md:px-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9f8652]">
                    Facturación
                  </div>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#5a2e3a] md:text-4xl">
                    Facturas Holded
                  </h2>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-[#6e6259]">
                    Listado mensual de facturas del portal. El bloque queda plegado
                    por defecto para priorizar la operativa superior.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setInvoicesCollapsed((prev) => !prev)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[#d8c08a] bg-[#fbf7f1] px-5 text-sm font-semibold text-[#5a2e3a] transition hover:bg-[#f7f1e8]"
                >
                  {invoicesCollapsed ? "Desplegar facturas" : "Plegar facturas"}
                </button>
              </div>
            </div>

            <div className="px-6 py-6 md:px-8">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-[24px] border border-[#d8c08a] bg-[#fbf7f1] p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f8652]">
                    Mes activo
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-[#5a2e3a]">
                    {selectedMonth}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#d8c08a] bg-[#fbf7f1] p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f8652]">
                    Actor
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-[#5a2e3a]">
                    {selectedDelegateId === "all" ? "Todos" : selectedDelegateId}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#d8c08a] bg-[#fbf7f1] p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f8652]">
                    Total facturas
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-[#5a2e3a]">
                    {stats.total}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#d8c08a] bg-[#fbf7f1] p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f8652]">
                    Importe total
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-[#5a2e3a]">
                    {money(stats.totalAmount)}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="billing-month"
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9f8652]"
                  >
                    Mes
                  </label>
                  <select
                    id="billing-month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-[#d8c08a] bg-[#fbf7f1] px-4 text-sm text-[#3d342e] outline-none"
                  >
                    {months.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="billing-actor"
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9f8652]"
                  >
                    Actor
                  </label>
                  <select
                    id="billing-actor"
                    value={selectedDelegateId}
                    onChange={(e) => setSelectedDelegateId(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-[#d8c08a] bg-[#fbf7f1] px-4 text-sm text-[#3d342e] outline-none"
                  >
                    <option value="all">Todos</option>
                    {delegateOptions.map((delegateId) => (
                      <option key={delegateId} value={delegateId}>
                        {delegateId}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!invoicesCollapsed ? (
                <div className="mt-6">
                  {loading ? (
                    <div className="rounded-[24px] border border-[#ded7ca] bg-[#fbf7f1] p-5 text-sm text-[#6e6259]">
                      Cargando facturas…
                    </div>
                  ) : null}

                  {!loading && error ? (
                    <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                      Error al cargar facturas: {error}
                    </div>
                  ) : null}

                  {!loading && !error ? (
                    <>
                      {filteredRows.length === 0 ? (
                        <div className="rounded-[24px] border border-[#ded7ca] bg-[#fbf7f1] p-5 text-sm text-[#6e6259]">
                          No hay facturas para este filtro.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-[24px] border border-[#ded7ca] bg-[#fbf7f1]">
                          <table className="min-w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-[#e5dccd] text-left">
                                <th className="px-5 py-4 font-semibold text-[#7a6d61]">Fecha</th>
                                <th className="px-5 py-4 font-semibold text-[#7a6d61]">Número</th>
                                <th className="px-5 py-4 font-semibold text-[#7a6d61]">Cliente</th>
                                <th className="px-5 py-4 font-semibold text-[#7a6d61]">Importe total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredRows.map((row) => (
                                <tr
                                  key={row.id}
                                  className="cursor-pointer border-b border-[#eee7dc] transition hover:bg-[#f8f3eb]"
                                  onClick={() => void openInvoice(row)}
                                >
                                  <td className="px-5 py-4 text-[#5f5348]">
                                    {fmtDate(row.invoice_date)}
                                  </td>
                                  <td className="px-5 py-4 font-semibold text-[#3f2630]">
                                    {safeText(row.invoice_number)}
                                  </td>
                                  <td className="px-5 py-4 text-[#5f5348]">
                                    {safeText(row.client_name ?? row.client_id)}
                                  </td>
                                  <td className="px-5 py-4 text-[#3f2630]">
                                    {money(resolveInvoiceTotal(row), safeText(row.currency, "EUR"))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 rounded-[22px] border border-[#ded7ca] bg-[#f8f6f2] px-5 py-4">
                  <div className="text-lg font-semibold text-[#2e2b28]">
                    Facturas plegadas
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#6e6259]">
                    El listado queda oculto por defecto para dar prioridad al
                    bloque operativo superior. Puedes desplegarlo cuando quieras.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />

          <div className="absolute right-0 top-0 h-full w-full max-w-[920px] overflow-y-auto border-l border-neutral-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Factura
                </div>
                <div className="text-xl font-semibold text-neutral-900">
                  {safeText(
                    (detailInvoice?.invoice_number as string | null | undefined) ??
                      selectedInvoiceRow?.invoice_number
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              {drawerLoading ? (
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
                  Cargando detalle de factura…
                </div>
              ) : null}

              {!drawerLoading && drawerError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  Error al cargar el detalle: {drawerError}
                </div>
              ) : null}

              {!drawerLoading && !drawerError ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Fecha
                      </div>
                      <div className="mt-1 text-base font-semibold text-neutral-900">
                        {fmtDate(
                          (detailInvoice?.invoice_date as string | null | undefined) ??
                            selectedInvoiceRow?.invoice_date
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Cliente
                      </div>
                      <div className="mt-1 text-base font-semibold text-neutral-900">
                        {safeText(
                          (detailInvoice?.client_name as string | null | undefined) ??
                            selectedInvoiceRow?.client_name ??
                            (detailInvoice?.client_id as string | null | undefined) ??
                            selectedInvoiceRow?.client_id
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Estado
                      </div>
                      <div className="mt-1 text-base font-semibold text-neutral-900">
                        {safeText(
                          (detailInvoice?.state_code as string | null | undefined) ??
                            selectedInvoiceRow?.state_code
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Base imponible
                      </div>
                      <div className="mt-1 text-base font-semibold text-neutral-900">
                        {money(detailInvoice?.total_net, detailCurrency)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Impuestos
                      </div>
                      <div className="mt-1 text-base font-semibold text-neutral-900">
                        {money(
                          toNumber(detailInvoice?.total_gross) - toNumber(detailInvoice?.total_net),
                          detailCurrency
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Total factura
                      </div>
                      <div className="mt-1 text-base font-semibold text-neutral-900">
                        {money(detailInvoice?.total_gross, detailCurrency)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Unidades
                      </div>
                      <div className="mt-1 text-base font-semibold text-neutral-900">
                        Venta {toNumber(detail?.units?.sold)} · Promo {toNumber(detail?.units?.promo)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white">
                    <div className="border-b border-neutral-200 px-4 py-3">
                      <div className="text-base font-semibold text-neutral-900">
                        Líneas de factura
                      </div>
                    </div>

                    {detailItems.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-neutral-600">
                        No hay líneas disponibles.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-neutral-200 text-left">
                              <th className="px-4 py-3 font-medium text-neutral-600">SKU</th>
                              <th className="px-4 py-3 font-medium text-neutral-600">Nombre</th>
                              <th className="px-4 py-3 font-medium text-neutral-600">Unid. venta</th>
                              <th className="px-4 py-3 font-medium text-neutral-600">Unid. promo</th>
                              <th className="px-4 py-3 font-medium text-neutral-600">Base imponible</th>
                              <th className="px-4 py-3 font-medium text-neutral-600">Impuestos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailItems.map((item, index) => (
                              <tr
                                key={String(item.id ?? `row-${index}`)}
                                className="border-b border-neutral-100"
                              >
                                <td className="px-4 py-3 font-mono text-neutral-700">
                                  {lineSku(item)}
                                </td>
                                <td className="px-4 py-3 text-neutral-900">
                                  {lineName(item)}
                                </td>
                                <td className="px-4 py-3 text-neutral-700">
                                  {unitsSale(item)}
                                </td>
                                <td className="px-4 py-3 text-neutral-700">
                                  {unitsPromo(item)}
                                </td>
                                <td className="px-4 py-3 text-neutral-700">
                                  {money(item.line_net_amount, detailCurrency)}
                                </td>
                                <td className="px-4 py-3 text-neutral-700">
                                  {money(item.line_vat_amount, detailCurrency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
                    Descripción larga de líneas ocultada intencionalmente en esta vista.
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}