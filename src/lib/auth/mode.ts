// src/lib/auth/mode.ts
/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Actor: VIHOLABS_AUTH_AGENT
 * Reason: Canonical mode semantics — include missing canonical roles in roleAllowsMode (KOL, COMMISSION_AGENT, DISTRIBUTOR)
 * Scope: roleAllowsMode only (no UI, no routes changes)
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

  // Control Room (supervisión / govern)
  if (mode === "control-room") {
    return (
      role === "SUPER_ADMIN" ||
      role === "ADMINISTRATIVE" ||
      role === "COORDINATOR_COMMERCIAL" ||
      role === "COORDINATOR_CECT"
    );
  }

  // Delegate (lent operativa comercial / relacional)
  // Nota: "mode" NO és portal; és estat/lent dins del Shell únic.
  if (mode === "delegate") {
    return (
      role === "DELEGATE" ||
      role === "KOL" ||
      role === "COMMISSION_AGENT" ||
      role === "DISTRIBUTOR" ||
      role === "SUPER_ADMIN" ||
      role === "ADMINISTRATIVE" ||
      role === "COORDINATOR_COMMERCIAL" ||
      role === "COORDINATOR_CECT"
    );
  }

  // Client (lent relacional client)
  if (mode === "client") {
    return role === "CLIENT" || role === "SUPER_ADMIN";
  }

  return false;
}

/**
 * Canon: single portal/shell. Mode never changes the entry route.
 * /mode may exist as internal utility, but must never be a normal entrypoint.
 */
export function pathForMode(_mode: ModeCode): string {
  return "/mode";
}
