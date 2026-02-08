// src/lib/auth/mode.ts

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

  // Delegate
  if (mode === "delegate") {
    return (
      role === "DELEGATE" ||
      role === "SUPER_ADMIN" ||
      role === "ADMINISTRATIVE" ||
      role === "COORDINATOR_COMMERCIAL" ||
      role === "COORDINATOR_CECT"
    );
  }

  // Client (lo dejamos preparado; si no existe /client aún, no pasa nada)
  if (mode === "client") {
    return role === "CLIENT" || role === "SUPER_ADMIN";
  }

  return false;
}

export function pathForMode(mode: ModeCode): string {
  if (mode === "control-room") return "/control-room/dashboard";
  if (mode === "delegate") return "/delegate/dashboard";
  return "/client/dashboard";
}
