"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import OrdersConsoleTab from "@/components/control-room/orders/OrdersConsoleTab";
import HoldedDocumentsFilters from "./holded-documents/HoldedDocumentsFilters";
import HoldedDocumentsList from "./holded-documents/HoldedDocumentsList";
import HoldedInvoiceDrawer from "./holded-documents/HoldedInvoiceDrawer";
import { useHoldedDocumentsData } from "./holded-documents/useHoldedDocumentsData";
import type {
  HoldedInvoiceRow,
  InvoiceDetail,
  InvoiceDetailResponse,
} from "./holded-documents/types";
import {
  buildActorOptions,
  currentMonth,
  monthOptions,
  money,
  resolveInvoiceTotal,
  rowMatchesActor,
  safeText,
  sortRows,
} from "./holded-documents/utils";

export default function HoldedDocumentsTable() {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth());
  const [selectedActorKey, setSelectedActorKey] = useState<string>("all");

  const { loading, error, rows } = useHoldedDocumentsData(selectedMonth);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [selectedInvoiceRow, setSelectedInvoiceRow] = useState<HoldedInvoiceRow | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);

  const [invoicesCollapsed, setInvoicesCollapsed] = useState(true);

  useEffect(() => {
    setSelectedActorKey("all");
    setDrawerOpen(false);
    setSelectedInvoiceRow(null);
    setDetail(null);
    setDrawerError(null);
  }, [selectedMonth]);

  const months = useMemo(() => monthOptions(18), []);

  const actorOptions = useMemo(() => buildActorOptions(rows), [rows]);

  const filteredRows = useMemo(() => {
    const base = rows.filter((row) => rowMatchesActor(row, selectedActorKey));
    return sortRows(base);
  }, [rows, selectedActorKey]);

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
                    {selectedActorKey === "all"
                      ? "Todos"
                      : (actorOptions.find((opt) => opt.key === selectedActorKey)?.label ?? "Todos")}
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

              <HoldedDocumentsFilters
                months={months}
                selectedMonth={selectedMonth}
                selectedActorKey={selectedActorKey}
                actorOptions={actorOptions}
                onMonthChange={setSelectedMonth}
                onActorChange={setSelectedActorKey}
              />

              {!invoicesCollapsed ? (
                <div className="mt-6">
                  <HoldedDocumentsList
                    loading={loading}
                    error={error}
                    filteredRows={filteredRows}
                    onOpenInvoice={openInvoice}
                  />
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

      <HoldedInvoiceDrawer
        drawerOpen={drawerOpen}
        drawerLoading={drawerLoading}
        drawerError={drawerError}
        selectedInvoiceRow={selectedInvoiceRow}
        detail={detail}
        onClose={closeDrawer}
      />
    </>
  );
}