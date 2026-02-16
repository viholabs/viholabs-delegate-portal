// src/lib/auth/roles.ts
/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Reason: Canonical entry — NO role portals. Everyone lands on the single Shell.
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
 * Tabs/actions/data are filtered by permissions + scope, never by alternate routes.
 */
export function entryForRole(_role: unknown) {
  // ✅ Single institutional entry for everyone
  return "/control-room/shell";
}

/**
 * ✅ Entry by actor (compatibility)
 * Canon: still returns the single Shell entry.
 */
export function entryForActor(_input: { role: unknown; commission_level?: unknown }) {
  return "/control-room/shell";
}