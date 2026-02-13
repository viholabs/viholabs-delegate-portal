// src/lib/auth/roles.ts
/**
 * AUDIT TRACE
 * Date: 2026-02-13
 * Reason: Canonical entry — roles must NOT emit role portals dashboards
 * Scope: entryForRole/entryForActor routing output only.
 */
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
 * ✅ Canonical entry by role
 * Canon: role never changes the portal/shell path.
 * (Commission agent stays on its own dashboard.)
 */
export function entryForRole(role: unknown) {
  const r = normalizeRole(role);

  if (r === "COMMISSION_AGENT") return "/commissions/dashboard";

  return "/control-room/dashboard";
}

/**
 * ✅ Entry by actor (compatibility)
 */
export function entryForActor(input: { role: unknown; commission_level?: unknown }) {
  const role = normalizeRole(input.role);

  if (role !== "COMMISSION_AGENT") {
    return entryForRole(role);
  }

  const _lvl = normalizeCommissionLevel(input.commission_level);

  return "/commissions/dashboard";
}
