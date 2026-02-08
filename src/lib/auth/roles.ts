// src/lib/auth/roles.ts

export type RoleCode =
  | "SUPER_ADMIN"
  | "COORDINATOR_COMMERCIAL"
  | "COORDINATOR_CECT"
  | "ADMINISTRATIVE"
  | "KOL"
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
 * ✅ Entrada canónica por rol
 * (ajustada a los nuevos dashboards separados)
 */
export function entryForRole(role: unknown) {
  const r = normalizeRole(role);

  if (r === "SUPER_ADMIN") return "/control-room/dashboard";
  if (r === "ADMINISTRATIVE") return "/control-room/dashboard";
  if (r === "COORDINATOR_CECT") return "/control-room/dashboard";

  if (r === "COORDINATOR_COMMERCIAL") return "/commercial/dashboard";
  if (r === "KOL") return "/kol/dashboard";

  if (r === "DELEGATE") return "/delegate/dashboard";
  if (r === "CLIENT") return "/client/dashboard";

  if (r === "COMMISSION_AGENT") return "/commissions/dashboard";
  if (r === "DISTRIBUTOR") return "/delegate/dashboard";

  return "/delegate/dashboard";
}

/**
 * ✅ Entrada por actor (compatibilidad total)
 */
export function entryForActor(input: { role: unknown; commission_level?: unknown }) {
  const role = normalizeRole(input.role);

  if (role !== "COMMISSION_AGENT") {
    return entryForRole(role);
  }

  const lvl = normalizeCommissionLevel(input.commission_level);

  // HOY: 1 dashboard para todos
  if (!lvl) return "/commissions/dashboard";
  return "/commissions/dashboard";
}
