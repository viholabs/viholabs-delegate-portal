"use client";

import type {
  EditorActorOption,
  EditorAffiliateOption,
  ElElyonInvoiceRow,
} from "./types";
import {
  money,
  resolveInvoiceTotal,
  safeText,
  sourceBadgeTone,
  sourceLabel,
} from "./utils";
import ElElyonPrecedenceCard from "./ElElyonPrecedenceCard";

type Props = {
  invoiceLoading?: boolean;
  invoiceSaving?: boolean;
  invoiceError?: string | null;
  invoiceRows?: ElElyonInvoiceRow[];
  filteredInvoiceRows?: ElElyonInvoiceRow[];
  selectedInvoiceId?: string;
  selectedInvoice?: ElElyonInvoiceRow | null;
  invoiceMonth?: string;
  invoiceMonths?: string[];
  invoiceSearch?: string;
  editorActors?: EditorActorOption[];
  editorAffiliates?: EditorAffiliateOption[];
  invoiceDelegateActorId?: string;
  invoiceRecommenderActorId?: string;
  invoiceAffiliateAccountId?: string;
  onMonthChange?: (value: string) => void;
  onSearchChange?: (value: string) => void;
  onSelectInvoice?: (invoiceId: string) => void;
  onDelegateChange?: (value: string) => void;
  onRecommenderChange?: (value: string) => void;
  onAffiliateChange?: (value: string) => void;
  onSave?: () => void;
};

export default function ElElyonInvoicesPanel({
  invoiceLoading = false,
  invoiceSaving = false,
  invoiceError = null,
  invoiceRows = [],
  filteredInvoiceRows = [],
  selectedInvoiceId = "",
  selectedInvoice = null,
  invoiceMonth = "",
  invoiceMonths = [],
  invoiceSearch = "",
  editorActors = [],
  editorAffiliates = [],
  invoiceDelegateActorId = "",
  invoiceRecommenderActorId = "",
  invoiceAffiliateAccountId = "",
  onMonthChange = () => {},
  onSearchChange = () => {},
  onSelectInvoice = () => {},
  onDelegateChange = () => {},
  onRecommenderChange = () => {},
  onAffiliateChange = () => {},
  onSave = () => {},
}: Props) {
  const safeInvoiceRows = Array.isArray(invoiceRows) ? invoiceRows : [];
  const safeFilteredInvoiceRows = Array.isArray(filteredInvoiceRows)
    ? filteredInvoiceRows
    : [];
  const safeInvoiceMonths = Array.isArray(invoiceMonths) ? invoiceMonths : [];
  const safeEditorActors = Array.isArray(editorActors) ? editorActors : [];
  const safeEditorAffiliates = Array.isArray(editorAffiliates)
    ? editorAffiliates
    : [];

  const visibleTotal = safeFilteredInvoiceRows.reduce(
    (acc, row) => acc + resolveInvoiceTotal(row),
    0,
  );

  return (
    <section className="rounded-[28px] border border-[#e7d9bf] bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-tight text-[#5a2e3a]">
          Gobernanza de facturas Holded
        </h2>
        <p className="mt-2 text-sm text-[#6b7280]">
          Vista canónica de gobierno por factura. Aquí puedes fijar overrides de
          delegado, recomendador y afiliado por factura concreta. La precedencia
          efectiva es <code>override factura &gt; derivación base</code>.
        </p>
      </div>

      {invoiceError ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {invoiceError}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="rounded-[24px] border border-[#eee2ca] bg-[#fcfaf5] p-4">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#5a2e3a]">
                Facturas del mes
              </h3>
              <p className="mt-1 text-sm text-[#6b7280]">
                Selecciona una factura y gobierna sus actores efectivos.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8b5e3c]">
                  Mes
                </label>
                <select
                  value={invoiceMonth}
                  onChange={(e) => onMonthChange(e.target.value)}
                  className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                >
                  {safeInvoiceMonths.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8b5e3c]">
                  Buscar
                </label>
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Factura, cliente, delegado, afiliado..."
                  className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                />
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[#eadfcf] bg-white px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b5e3c]">
                Mes activo
              </div>
              <div className="mt-2 text-lg font-semibold text-[#5a2e3a]">
                {invoiceMonth}
              </div>
            </div>

            <div className="rounded-2xl border border-[#eadfcf] bg-white px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b5e3c]">
                Facturas visibles
              </div>
              <div className="mt-2 text-lg font-semibold text-[#5a2e3a]">
                {safeFilteredInvoiceRows.length}
              </div>
            </div>

            <div className="rounded-2xl border border-[#eadfcf] bg-white px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b5e3c]">
                Total visible
              </div>
              <div className="mt-2 text-lg font-semibold text-[#5a2e3a]">
                {money(visibleTotal, "EUR")}
              </div>
            </div>
          </div>

          <div className="max-h-[640px] overflow-auto rounded-2xl border border-[#eadfcf] bg-white">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[#fbf6ec]">
                <tr className="border-b border-[#eadfcf] text-left text-[#5a2e3a]">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Delegado</th>
                  <th className="px-4 py-3 font-medium">Recomendador</th>
                  <th className="px-4 py-3 font-medium">Afiliado</th>
                  <th className="px-4 py-3 font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {safeFilteredInvoiceRows.map((row) => {
                  const active = row.id === selectedInvoiceId;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => onSelectInvoice(row.id)}
                      className={`cursor-pointer border-b border-[#f1e9db] transition ${
                        active ? "bg-[#fff5df]" : "hover:bg-[#fcfaf5]"
                      }`}
                    >
                      <td className="px-4 py-3 align-top text-[#5f6670]">
                        {safeText(row.invoice_date)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-[#3f2a31]">
                          {safeText(row.invoice_number)}
                        </div>
                        <div className="mt-1 text-[11px] text-[#8a8f98]">
                          {safeText(row.state_code)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-[#5f6670]">
                        {safeText(row.client_name)}
                      </td>
                      <td className="px-4 py-3 align-top text-[#5f6670]">
                        <div>{safeText(row.delegate_name)}</div>
                        <div className="mt-1">
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              sourceBadgeTone(row.delegate_source),
                            ].join(" ")}
                          >
                            {sourceLabel(row.delegate_source)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-[#5f6670]">
                        <div>{safeText(row.recommender_name)}</div>
                        <div className="mt-1">
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              sourceBadgeTone(row.recommender_source),
                            ].join(" ")}
                          >
                            {sourceLabel(row.recommender_source)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-[#5f6670]">
                        <div>{safeText(row.affiliate_name)}</div>
                        <div className="mt-1">
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              sourceBadgeTone(row.affiliate_source),
                            ].join(" ")}
                          >
                            {sourceLabel(row.affiliate_source)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top font-medium text-[#3f2a31]">
                        {money(resolveInvoiceTotal(row), row.currency ?? "EUR")}
                      </td>
                    </tr>
                  );
                })}

                {!invoiceLoading && safeFilteredInvoiceRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#8a8f98]">
                      No hay facturas para este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[24px] border border-[#eee2ca] bg-[#fcfaf5] p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-[#5a2e3a]">
                Editor por factura
              </h3>
              <p className="mt-1 text-sm text-[#6b7280]">
                Fija manualmente delegado, recomendador y afiliado para la factura seleccionada.
              </p>
            </div>

            {selectedInvoice ? (
              <div className="mb-4 rounded-2xl border border-[#eadfcf] bg-white px-4 py-4 text-sm">
                <div className="font-medium text-[#3f2a31]">
                  {safeText(selectedInvoice.invoice_number)} ·{" "}
                  {safeText(selectedInvoice.client_name)}
                </div>
                <div className="mt-1 text-xs text-[#8a8f98]">
                  {safeText(selectedInvoice.invoice_date)} ·{" "}
                  {money(resolveInvoiceTotal(selectedInvoice), selectedInvoice.currency ?? "EUR")}
                </div>

                <div className="mt-4 grid gap-3 text-xs text-[#6b7280]">
                  <div>
                    Delegado efectivo actual:{" "}
                    <strong className="text-[#5a2e3a]">
                      {safeText(selectedInvoice.delegate_name, "Sin asignar")}
                    </strong>{" "}
                    · {sourceLabel(selectedInvoice.delegate_source)}
                  </div>
                  <div>
                    Recomendador efectivo actual:{" "}
                    <strong className="text-[#5a2e3a]">
                      {safeText(selectedInvoice.recommender_name, "Sin asignar")}
                    </strong>{" "}
                    · {sourceLabel(selectedInvoice.recommender_source)}
                  </div>
                  <div>
                    Afiliado efectivo actual:{" "}
                    <strong className="text-[#5a2e3a]">
                      {safeText(selectedInvoice.affiliate_name, "Sin asignar")}
                    </strong>{" "}
                    · {sourceLabel(selectedInvoice.affiliate_source)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-2xl border border-[#eadfcf] bg-white px-4 py-4 text-sm text-[#8a8f98]">
                Selecciona una factura en la tabla.
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                  Delegado override
                </label>
                <select
                  value={invoiceDelegateActorId}
                  onChange={(e) => onDelegateChange(e.target.value)}
                  disabled={!selectedInvoice || invoiceLoading || invoiceSaving}
                  className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                >
                  <option value="">Sin override (usar base)</option>
                  {safeEditorActors.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                  Recomendador override
                </label>
                <select
                  value={invoiceRecommenderActorId}
                  onChange={(e) => onRecommenderChange(e.target.value)}
                  disabled={!selectedInvoice || invoiceLoading || invoiceSaving}
                  className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                >
                  <option value="">Sin override (usar base)</option>
                  {safeEditorActors.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                  Afiliado override
                </label>
                <select
                  value={invoiceAffiliateAccountId}
                  onChange={(e) => onAffiliateChange(e.target.value)}
                  disabled={!selectedInvoice || invoiceLoading || invoiceSaving}
                  className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                >
                  <option value="">Sin override (usar base)</option>
                  {safeEditorAffiliates.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={onSave}
                disabled={!selectedInvoice || invoiceLoading || invoiceSaving}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#5a2e3a] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {invoiceSaving ? "Guardando..." : "Guardar overrides de factura"}
              </button>
            </div>
          </div>

          <ElElyonPrecedenceCard />
        </div>
      </div>
    </section>
  );
}