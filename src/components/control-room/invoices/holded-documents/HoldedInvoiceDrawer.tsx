import type { HoldedInvoiceRow, InvoiceDetail } from "./types";
import { resolveInvoiceVisualStatus } from "./status";
import {
  fmtDate,
  lineName,
  lineSku,
  money,
  safeText,
  toNumber,
  unitsPromo,
  unitsSale,
} from "./utils";

type Props = {
  drawerOpen: boolean;
  drawerLoading: boolean;
  drawerError: string | null;
  selectedInvoiceRow: HoldedInvoiceRow | null;
  detail: InvoiceDetail | null;
  onClose: () => void;
};

export default function HoldedInvoiceDrawer({
  drawerOpen,
  drawerLoading,
  drawerError,
  selectedInvoiceRow,
  detail,
  onClose,
}: Props) {
  if (!drawerOpen) return null;

  const detailInvoice = detail?.invoice ?? null;
  const detailItems = Array.isArray(detail?.items) ? detail.items : [];
  const detailCurrency = safeText(
    (detailInvoice?.currency as string | null | undefined) ??
      selectedInvoiceRow?.currency ??
      "EUR",
    "EUR"
  );

  const visualRow: HoldedInvoiceRow = {
    id: String(selectedInvoiceRow?.id ?? ""),
    invoice_number:
      (detailInvoice?.invoice_number as string | null | undefined) ??
      selectedInvoiceRow?.invoice_number ??
      null,
    invoice_date:
      (detailInvoice?.invoice_date as string | null | undefined) ??
      selectedInvoiceRow?.invoice_date ??
      null,
    client_id:
      (detailInvoice?.client_id as string | null | undefined) ??
      selectedInvoiceRow?.client_id ??
      null,
    client_name:
      (detailInvoice?.client_name as string | null | undefined) ??
      selectedInvoiceRow?.client_name ??
      null,
    delegate_id: selectedInvoiceRow?.delegate_id ?? null,
    delegate_name: selectedInvoiceRow?.delegate_name ?? null,
    recommender_id: selectedInvoiceRow?.recommender_id ?? null,
    recommender_name: selectedInvoiceRow?.recommender_name ?? null,
    affiliate_account_id: selectedInvoiceRow?.affiliate_account_id ?? null,
    source_provider: selectedInvoiceRow?.source_provider ?? null,
    source_channel: selectedInvoiceRow?.source_channel ?? null,
    external_invoice_id:
      (detailInvoice?.external_invoice_id as string | null | undefined) ??
      selectedInvoiceRow?.external_invoice_id ??
      null,
    holded_contact_id: selectedInvoiceRow?.holded_contact_id ?? null,
    state_code:
      (detailInvoice?.state_code as string | null | undefined) ??
      selectedInvoiceRow?.state_code ??
      null,
    holded_status_label:
      (detailInvoice?.holded_status_label as string | null | undefined) ??
      selectedInvoiceRow?.holded_status_label ??
      null,
    due_date:
      (detailInvoice?.due_date as string | null | undefined) ??
      selectedInvoiceRow?.due_date ??
      null,
    source_month: selectedInvoiceRow?.source_month ?? null,
    total_net:
      (detailInvoice?.total_net as number | string | null | undefined) ??
      selectedInvoiceRow?.total_net ??
      null,
    total_gross:
      (detailInvoice?.total_gross as number | string | null | undefined) ??
      selectedInvoiceRow?.total_gross ??
      null,
    currency:
      (detailInvoice?.currency as string | null | undefined) ??
      selectedInvoiceRow?.currency ??
      "EUR",
    is_paid:
      (detailInvoice?.is_paid as boolean | null | undefined) ??
      selectedInvoiceRow?.is_paid ??
      null,
    paid_date:
      (detailInvoice?.paid_date as string | null | undefined) ??
      selectedInvoiceRow?.paid_date ??
      null,
  };

  const visualStatus = resolveInvoiceVisualStatus(visualRow);

  const dueDateRaw =
    (detailInvoice?.due_date as string | null | undefined) ??
    visualRow.due_date ??
    null;

  const paymentMethodRaw =
    (detailInvoice?.payment_method_label as string | null | undefined) ?? null;

  const paymentDateRaw =
    (detailInvoice?.paid_date as string | null | undefined) ??
    visualRow.paid_date ??
    null;

  const dueDate = dueDateRaw ? fmtDate(dueDateRaw) : "—";
  const paymentDate = paymentDateRaw ? fmtDate(paymentDateRaw) : "—";
  const paymentMethod = safeText(paymentMethodRaw, "No informado");

  const summaryUnits = detailItems.reduce(
    (acc, item) => {
      acc.sold += unitsSale(item);
      acc.promo += unitsPromo(item);
      return acc;
    },
    { sold: 0, promo: 0 }
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

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
            onClick={onClose}
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
              <div className="grid gap-3 md:grid-cols-4">
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
                  <div className="mt-2">
                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                        visualStatus.toneClassName,
                      ].join(" ")}
                    >
                      {visualStatus.label}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Pago
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-900">
                    {paymentDate}
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
                    Venta {summaryUnits.sold} · Promo {summaryUnits.promo}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Vencimiento
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-900">
                    {dueDate}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Forma de pago
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-900">
                    {paymentMethod}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Delegado
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-900">
                    {safeText(visualRow.delegate_name)}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Recomendador
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-900">
                    {safeText(visualRow.recommender_name)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-1">
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Afiliado
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-900">
                    {safeText(visualRow.affiliate_account_id)}
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
  );
}