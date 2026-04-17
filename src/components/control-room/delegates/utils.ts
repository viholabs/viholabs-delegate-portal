// src/components/control-room/delegates/utils.ts
// Utilidades compartidas para el módulo Delegates (list + detail).

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function safeText(value: string | null | undefined, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

export function formatMoney(value: number | null | undefined): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatMonthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, monthPart] = month.split("-");
  const d = new Date(Number(year), Number(monthPart) - 1, 1);
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(d);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDatetime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function statusTone(status: string | null | undefined): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "active" || normalized === "activo") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "inactive" || normalized === "inactivo") {
    return "border-neutral-200 bg-neutral-100 text-neutral-600";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function paymentStatusBadge(status: "PAID" | "PENDING" | "OVERDUE" | "CREDIT_NOTE"): {
  label: string;
  classes: string;
} {
  switch (status) {
    case "PAID":
      return { label: "Pagada", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "OVERDUE":
      return { label: "Vencida", classes: "border-red-200 bg-red-50 text-red-700" };
    case "CREDIT_NOTE":
      return { label: "Abono/CN", classes: "border-purple-200 bg-purple-50 text-purple-700" };
    case "PENDING":
    default:
      return { label: "Pendiente", classes: "border-amber-200 bg-amber-50 text-amber-700" };
  }
}

export function settlementStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "Borrador",
    PENDING_VALIDATION: "Pendiente validación",
    VALIDATED: "Validada",
    NOTIFIED: "Notificada",
    ACCEPTED: "Aceptada",
    IN_REVIEW: "En revisión",
    REISSUED: "Reemitida",
    CLOSED: "Cerrada",
  };
  return map[status] ?? status;
}

export function settlementStatusTone(status: string): string {
  switch (status) {
    case "DRAFT":
      return "border-neutral-200 bg-neutral-50 text-neutral-600";
    case "PENDING_VALIDATION":
    case "IN_REVIEW":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "VALIDATED":
    case "NOTIFIED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "ACCEPTED":
    case "CLOSED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REISSUED":
      return "border-purple-200 bg-purple-50 text-purple-700";
    default:
      return "border-neutral-200 bg-neutral-100 text-neutral-600";
  }
}
