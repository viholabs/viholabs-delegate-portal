import type { HoldedInvoiceRow } from "./types";
import HoldedInvoiceStatusBadge from "./HoldedInvoiceStatusBadge";
import {
  affiliateLabel,
  fmtDate,
  money,
  resolveInvoiceTotal,
  safeText,
} from "./utils";

type Props = {
  loading: boolean;
  error: string | null;
  filteredRows: HoldedInvoiceRow[];
  onOpenInvoice: (row: HoldedInvoiceRow) => void | Promise<void>;
};

export default function HoldedDocumentsList({
  loading,
  error,
  filteredRows,
  onOpenInvoice,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-[24px] border border-[#ded7ca] bg-[#fbf7f1] p-5 text-sm text-[#6e6259]">
        Cargando facturas…
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Error al cargar facturas: {error}
      </div>
    );
  }

  if (filteredRows.length === 0) {
    return (
      <div className="rounded-[24px] border border-[#ded7ca] bg-[#fbf7f1] p-5 text-sm text-[#6e6259]">
        No hay facturas para este filtro.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[24px] border border-[#ded7ca] bg-[#fbf7f1]">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#e5dccd] text-left">
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Fecha</th>
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Número</th>
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Cliente</th>
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Delegado</th>
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Recomendador</th>
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Afiliado</th>
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Estado</th>
            <th className="px-5 py-4 font-semibold text-[#7a6d61]">Importe total</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-b border-[#eee7dc] transition hover:bg-[#f8f3eb]"
              onClick={() => void onOpenInvoice(row)}
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

              <td className="px-5 py-4 text-[#5f5348]">
                {safeText(row.delegate_name)}
              </td>

              <td className="px-5 py-4 text-[#5f5348]">
                {safeText(row.recommender_name)}
              </td>

              <td className="px-5 py-4 text-[#5f5348]">
                {affiliateLabel(row.affiliate_account_id)}
              </td>

              <td className="px-5 py-4 text-[#5f5348]">
                <HoldedInvoiceStatusBadge row={row} />
              </td>

              <td className="px-5 py-4 text-[#3f2630]">
                {money(resolveInvoiceTotal(row), safeText(row.currency, "EUR"))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
