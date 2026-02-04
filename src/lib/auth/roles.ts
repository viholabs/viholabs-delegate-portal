// src/lib/auth/roles.ts

export type RoleCode =
  | "SUPER_ADMIN"
  | "COORDINATOR_COMMERCIAL"
  | "COORDINATOR_CECT"
  | "ADMINISTRATIVE"
  | "DELEGATE"
  | "CLIENT"
  | "COMMISSION_AGENT"
  | "DISTRIBUTOR"
  | string;

export type CommissionLevel = 1 | 2 | 3 | 4 | 5;

export function normalizeRole(role: unknown): RoleCode {
  const r = String(role ?? "").trim();
  if (!r) return "";
  return r.toUpperCase() as RoleCode;
}

export function normalizeCommissionLevel(v: unknown): CommissionLevel | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return null;
}

/**
 * ✅ Compatibilidad total:
 * Muchos archivos antiguos llaman entryForRole(actor.role).
 * Lo mantenemos y NO rompe nada.
 */
export function entryForRole(role: unknown) {
  const r = normalizeRole(role);

  if (r === "SUPER_ADMIN") return "/control-room/dashboard";
  if (r === "COORDINATOR_COMMERCIAL") return "/control-room/dashboard";
  if (r === "COORDINATOR_CECT") return "/control-room/dashboard";
  if (r === "ADMINISTRATIVE") return "/control-room/dashboard";

  if (r === "DELEGATE") return "/delegate/dashboard";
  if (r === "CLIENT") return "/client/dashboard";

  if (r === "COMMISSION_AGENT") return "/commissions/dashboard";
  if (r === "DISTRIBUTOR") return "/delegate/dashboard";

  return "/delegate/dashboard";
}

/**
 * ✅ Opción robusta para miles de usuarios:
 * Entrada por actor (rol + metadatos), sin inventar 5 roles.
 * commission_level = 1..5 es metadato (para reglas de comisión, filtros, UI…).
 */
export function entryForActor(input: { role: unknown; commission_level?: unknown }) {
  const role = normalizeRole(input.role);

  if (role !== "COMMISSION_AGENT") {
    return entryForRole(role);
  }

  const lvl = normalizeCommissionLevel(input.commission_level);

  // HOY: 1 dashboard para todos (lo más robusto)
  if (!lvl) return "/commissions/dashboard";
  return "/commissions/dashboard";

  // FUTURO (si un día quieres pantallas por nivel):
  // return `/commissions/level-${lvl}`;
}
