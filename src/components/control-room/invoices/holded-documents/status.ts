import type { HoldedInvoiceRow } from "./types";

export type InvoiceVisualStatus = {
  code: string;
  label: string;
  toneClassName: string;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function resolveInvoiceVisualStatus(
  row: HoldedInvoiceRow
): InvoiceVisualStatus {
  const label = String(row.holded_status_label ?? "").trim();
  const normalized = normalize(label);

  if (!label) {
    return {
      code: "sin-estado",
      label: "Sin estado",
      toneClassName: "border-neutral-200 bg-neutral-50 text-neutral-700",
    };
  }

  if (normalized === "PAGADO") {
    return {
      code: "pagado",
      label: "Pagado",
      toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (normalized === "VENCIDO") {
    return {
      code: "vencido",
      label: "Vencido",
      toneClassName: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (normalized === "PENDIENTE") {
    return {
      code: "pendiente",
      label: "Pendiente",
      toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    code: normalized.toLowerCase(),
    label,
    toneClassName: "border-blue-200 bg-blue-50 text-blue-700",
  };
}