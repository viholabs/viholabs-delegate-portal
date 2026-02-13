// src/lib/auth/mode.ts
/**
 * AUDIT TRACE
 * Date: 2026-02-13
 * Reason: Canonical entry — mode must NOT emit role portals paths
 * Scope: pathForMode routing output only.
 */
export type ModeCode = "control-room" | "delegate" | "client";

export const MODE_COOKIE = "viholabs_mode";

export function normalizeMode(v: unknown): ModeCode | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "control-room") return "control-room";
  if (s === "delegate") return "delegate";
  if (s === "client") return "client";
  return null;
}

export function roleAllowsMode(roleRaw: unknown, mode: ModeCode): boolean {
  const role = String(roleRaw ?? "").trim().toUpperCase();

  // Control Room (supervisión)
  if (mode === "control-room") {
    return (
      role === "SUPER_ADMIN" ||
      role === "ADMINISTRATIVE" ||
      role === "COORDINATOR_COMMERCIAL" ||
      role === "COORDINATOR_CECT"
    );
  }

  // Delegate (modo lógico; no portal)
  if (mode === "delegate") {
    return (
      role === "DELEGATE" ||
      role === "SUPER_ADMIN" ||
      role === "ADMINISTRATIVE" ||
      role === "COORDINATOR_COMMERCIAL" ||
      role === "COORDINATOR_CECT"
    );
  }

  // Client (modo lógico; no portal)
  if (mode === "client") {
    return role === "CLIENT" || role === "SUPER_ADMIN";
  }

  return false;
}

/**
 * Canon: single portal/shell. Mode never changes the entry route.
 */
export function pathForMode(_mode: ModeCode): string {
  return "/control-room/dashboard";
}
