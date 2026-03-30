import type { HoldedInvoiceRow } from "./types";
import { resolveInvoiceVisualStatus } from "./status";

type Props = {
  row: HoldedInvoiceRow;
};

export default function HoldedInvoiceStatusBadge({ row }: Props) {
  const status = resolveInvoiceVisualStatus(row);

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        status.toneClassName,
      ].join(" ")}
    >
      {status.label}
    </span>
  );
}