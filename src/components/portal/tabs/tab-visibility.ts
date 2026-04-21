// src/components/portal/tabs/tab-visibility.ts

import { TAB_REGISTRY, type TabDefinition } from "./tab-registry";

export type SystemRole =
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

export type VihoRole =
  | "MELQUISEDEC"
  | "COORDINADOR"
  | "ADMINISTRATIVA"
  | "KOL"
  | "DELEGADO"
  | "CLIENTE"
  | "CONSULTOR";

export function bridgeSystemRoleToVihoRole(roleRaw: unknown): VihoRole {
  const role = String(roleRaw ?? "").trim().toUpperCase();

  if (role === "SUPER_ADMIN" || role === "MELQUISEDEC") return "MELQUISEDEC";
  if (
    role === "COORDINATOR_COMMERCIAL" ||
    role === "COORDINATOR_CECT"
  ) {
    return "COORDINADOR";
  }
  if (role === "ADMINISTRATIVE") return "ADMINISTRATIVA";
  if (role === "KOL") return "KOL";
  if (
    role === "DELEGATE" ||
    role === "COMMISSION_AGENT" ||
    role === "DISTRIBUTOR"
  ) {
    return "DELEGADO";
  }
  if (role === "CLIENT") return "CLIENTE";

  return "CONSULTOR";
}

export function getVisibleTabsForRole(_role: VihoRole): TabDefinition[] {
  return TAB_REGISTRY;
}

export function getVisibleTabsForSystemRole(
  role: unknown,
): TabDefinition[] {
  const vihoRole = bridgeSystemRoleToVihoRole(role);
  return getVisibleTabsForRole(vihoRole);
}

export function toPortalShellTabs(tabs: TabDefinition[]) {
  return tabs.map((tab) => ({
    href: tab.href,
    label: tab.label,
  }));
}