import type { ElElyonInvoiceRow } from "./types";

export function safeText(value: string | null | undefined, fallback = "—") {
  const v = String(value ?? "").trim();
  return v ? v : fallback;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function money(value: unknown, currency = "EUR") {
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

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function monthOptions(count = 18): string[] {
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

export function sourceBadgeTone(source: string | null | undefined) {
  const v = String(source ?? "").trim().toUpperCase();

  if (v === "OVERRIDE_INVOICE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (v === "CLIENT_CURRENT" || v === "ATTRIBUTION_CURRENT") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (v === "INVOICE_BASE") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

export function sourceLabel(source: string | null | undefined) {
  const v = String(source ?? "").trim().toUpperCase();

  if (v === "OVERRIDE_INVOICE") return "Override factura";
  if (v === "CLIENT_CURRENT") return "Cliente actual";
  if (v === "INVOICE_BASE") return "Base factura";
  if (v === "ATTRIBUTION_CURRENT") return "Atribución actual";
  if (v === "NONE") return "Sin fuente";

  return v || "Sin fuente";
}

export function resolveInvoiceTotal(row: ElElyonInvoiceRow) {
  if (row.total_gross != null) return toNumber(row.total_gross);
  if (row.total_net != null) return toNumber(row.total_net);
  return 0;
}