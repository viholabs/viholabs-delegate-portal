import type { ClientListItem } from "./types";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function compact(value: string | null | undefined) {
  const safe = String(value ?? "").trim();
  return safe.length > 0 ? safe : "—";
}

export function normalizeIban(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function isValidEmail(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export function isValidIban(value: string | null | undefined) {
  const raw = normalizeIban(String(value ?? ""));
  if (!raw) return true;
  return /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(raw);
}

export function buildDisplayName(client: ClientListItem) {
  return client.name || client.legal_name || "Cliente sin nombre";
}