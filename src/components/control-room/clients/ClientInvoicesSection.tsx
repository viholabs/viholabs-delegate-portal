// src/components/control-room/clients/ClientInvoicesSection.tsx
"use client";

import { useState } from "react";

import type {
  ClientDetailViewModel,
  ClientInvoice,
  InvoiceDetailResponse,
} from "./types";
import SectionCard from "./SectionCard";
import { BORDER, MUTED, SOFT, SURFACE, tdStyle, TEXT, thStyle } from "./ui";
import { compact, formatMoney } from "./utils";

function formatDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return raw;
}

function formatBoolean(value: unknown) {
  if (value === null || value === undefined) return "—";
  return value ? "Sí" : "No";
}

function formatMaybeMoney(value: unknown) {
  return formatMoney(typeof value === "number" ? value : Number(value ?? 0));
}

export default function ClientInvoicesSection({
  selected,
}: {
  selected: ClientDetailViewModel;
}) {
  const [hoveredInvoiceId, setHoveredInvoiceId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetailResponse | null>(null);

  async function openInvoice(invoice: ClientInvoice) {
    try {
      setActiveInvoiceId(invoice.id);
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);

      const res = await fetch(`/api/holded/invoices/${invoice.id}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as InvoiceDetailResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo cargar el detalle de la factura");
      }

      setDetail(json);
    } catch (error: unknown) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Error cargando el detalle de la factura"
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function closeInvoiceDetail() {
    setActiveInvoiceId(null);
    setDetailLoading(false);
    setDetailError(null);
    setDetail(null);
  }

  return (
    <SectionCard
      title="Facturas emitidas"
      subtitle="Histórico reciente del cliente. Pulsa una fila para abrir el detalle."
    >
      {!selected.invoices || selected.invoices.length === 0 ? (
        <div
          style={{
            color: MUTED,
            fontSize: 14,
            lineHeight: 1.5,
            border: `1px dashed ${BORDER}`,
            borderRadius: 14,
            padding: 16,
          }}
        >
          No hay facturas asociadas o no se pudieron recuperar.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              overflowX: "auto",
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 760,
                background: SURFACE,
              }}
            >
              <thead>
                <tr style={{ background: SOFT }}>
                  <th style={thStyle}>Número</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Importe neto</th>
                  <th style={thStyle}>Importe bruto</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Pagada</th>
                </tr>
              </thead>
              <tbody>
                {selected.invoices.map((invoice) => {
                  const isActive = activeInvoiceId === invoice.id;
                  const isHovered = hoveredInvoiceId === invoice.id;

                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => void openInvoice(invoice)}
                      onMouseEnter={() => setHoveredInvoiceId(invoice.id)}
                      onMouseLeave={() => setHoveredInvoiceId(null)}
                      style={{
                        cursor: "pointer",
                        background: isActive
                          ? "rgba(0,0,0,0.05)"
                          : isHovered
                          ? "rgba(0,0,0,0.025)"
                          : SURFACE,
                      }}
                      title="Abrir detalle de la factura"
                    >
                      <td style={tdStyle}>{compact(invoice.invoice_number)}</td>
                      <td style={tdStyle}>{compact(invoice.invoice_date)}</td>
                      <td style={tdStyle}>{formatMoney(invoice.total_net)}</td>
                      <td style={tdStyle}>{formatMoney(invoice.total_gross)}</td>
                      <td style={tdStyle}>{compact(invoice.state_code)}</td>
                      <td style={tdStyle}>
                        {invoice.is_paid === null
                          ? "—"
                          : invoice.is_paid
                          ? "Sí"
                          : "No"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {activeInvoiceId ? (
            <div
              style={{
                border: `1px solid ${BORDER}`,
                borderRadius: 18,
                background: SURFACE,
                padding: 16,
                display: "grid",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <h3
                    style={{
                      margin: 0,
                      color: TEXT,
                      fontSize: 18,
                      lineHeight: 1.2,
                    }}
                  >
                    Detalle de factura
                  </h3>
                  <div
                    style={{
                      fontSize: 13,
                      color: MUTED,
                      lineHeight: 1.45,
                    }}
                  >
                    Vista interna dentro de la ficha del cliente, sin salir del
                    Shell.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeInvoiceDetail}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: SURFACE,
                    color: TEXT,
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cerrar detalle
                </button>
              </div>

              {detailLoading ? (
                <div
                  style={{
                    color: MUTED,
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  Cargando detalle de factura…
                </div>
              ) : detailError ? (
                <div
                  style={{
                    color: MUTED,
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {detailError}
                </div>
              ) : detail?.invoice ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    <DetailCell
                      label="Número"
                      value={detail.invoice.invoice_number}
                    />
                    <DetailCell
                      label="Fecha"
                      value={formatDate(detail.invoice.invoice_date)}
                    />
                    <DetailCell
                      label="Cliente"
                      value={detail.invoice.client_name}
                    />
                    <DetailCell
                      label="Importe neto"
                      value={formatMaybeMoney(detail.invoice.total_net)}
                    />
                    <DetailCell
                      label="Importe bruto"
                      value={formatMaybeMoney(detail.invoice.total_gross)}
                    />
                    <DetailCell
                      label="Pagada"
                      value={formatBoolean(detail.invoice.is_paid)}
                    />
                    <DetailCell
                      label="Estado"
                      value={
                        detail.invoice.holded_status_label ??
                        detail.invoice.state_code ??
                        "—"
                      }
                    />
                    <DetailCell
                      label="Método de pago"
                      value={
                        detail.invoice.payment_method_label ??
                        detail.invoice.payment_method_name ??
                        "—"
                      }
                    />
                    <DetailCell
                      label="Términos de pago"
                      value={detail.invoice.payment_terms_name ?? "—"}
                    />
                    <DetailCell
                      label="Vencimiento"
                      value={formatDate(detail.invoice.due_date)}
                    />
                    <DetailCell
                      label="Fecha de pago"
                      value={formatDate(detail.invoice.paid_date)}
                    />
                    <DetailCell
                      label="Estado técnico"
                      value={detail.invoice.state_code ?? "—"}
                    />
                  </div>

                  {Array.isArray(detail.items) && detail.items.length > 0 ? (
                    <div
                      style={{
                        overflowX: "auto",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 14,
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          minWidth: 760,
                          background: SURFACE,
                        }}
                      >
                        <thead>
                          <tr style={{ background: SOFT }}>
                            <th style={thStyle}>Concepto</th>
                            <th style={thStyle}>SKU</th>
                            <th style={thStyle}>Tipo</th>
                            <th style={thStyle}>Unidades</th>
                            <th style={thStyle}>Subtotal</th>
                            <th style={thStyle}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((item, index) => (
                            <tr key={`${activeInvoiceId}-${index}`}>
                              <td style={tdStyle}>
                                {compact(item.description || item.name)}
                              </td>
                              <td style={tdStyle}>{compact(item.sku)}</td>
                              <td style={tdStyle}>{compact(item.kind)}</td>
                              <td style={tdStyle}>
                                {compact(
  item.units != null
    ? String(item.units)
    : item.quantity != null
    ? String(item.quantity)
    : null
)}
                              </td>
                              <td style={tdStyle}>
                                {item.subtotal == null
                                  ? "—"
                                  : formatMaybeMoney(item.subtotal)}
                              </td>
                              <td style={tdStyle}>
                                {item.total == null
                                  ? "—"
                                  : formatMaybeMoney(item.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div
                      style={{
                        color: MUTED,
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      Esta factura no devuelve líneas o no hay soporte real para
                      mostrarlas.
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

function DetailCell({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: 12,
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: MUTED,
          textTransform: "uppercase",
          letterSpacing: 0.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: TEXT,
          lineHeight: 1.45,
        }}
      >
        {String(value ?? "—")}
      </div>
    </div>
  );
}