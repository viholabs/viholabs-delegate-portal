/**
 * VIHOLABS — ROLE VISIBILITY MAP (CANÓNICO V1)
 *
 * Regla suprema:
 * - Visibilidad ≠ Permisos funcionales
 * - Nunca altera geometría del Shell
 * - Visibilidad debe derivar de rol real (DB) via bridge estable
 */

import { TAB_REGISTRY, type TabCode, type TabDefinition } from "./tab-registry";

/**
 * Roles reales del sistema (DB).
 * IMPORTANT: no inventamos roles; usamos los que ya existen en auth/roles.ts
 */
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

/**
 * Roles canónicos de visibilidad (UI lens).
 * Esto es un “perfil de visibilidad”, no un permiso.
 */
export type VihoRole =
  | "FERNANDO"
  | "MELQUISEDEC"
  | "KOL"
  | "COORDINADOR"
  | "DELEGADO"
  | "ADMINISTRATIVA"
  | "CLIENTE"
  | "CONSULTOR";

/**
 * ✅ Mapa de visibilidad por perfil (VihoRole)
 */
export const ROLE_VISIBILITY_MAP_V1: Record<VihoRole, TabCode[]> = {
  FERNANDO: [
    "situation",
    "evolution",
    "objectives",
    "commissions",
    "alerts",
    "communications",
    "clinical_criteria",
    "tech_block",
    "consultas",
    "casos",
    "recursos",
    "delegados",
    "clientes",
    "knowledge",
    "obexperience",
  ],

  MELQUISEDEC: [
    "situation",
    "evolution",
    "objectives",
    "commissions",
    "alerts",
    "communications",
    "clinical_criteria",
    "tech_block",
    "consultas",
    "casos",
    "recursos",
    "delegados",
    "clientes",
    "knowledge",
    "obexperience",
    "el_elyon", // ✅ EXCLUSIVO
  ],

  KOL: [
    "situation",
    "evolution",
    "objectives",
    "alerts",
    "communications",
    "clinical_criteria",
    "consultas",
    "casos",
    "recursos",
    "knowledge",
    "obexperience",
  ],

  // ✅ PERFIL MERAMENTE COMERCIAL
  COORDINADOR: [
    "situation",
    "evolution",
    "objectives",
    "alerts",
    "communications",
    "recursos",
    "delegados",
    "clientes",
    "knowledge",
  ],

  DELEGADO: [
    "situation",
    "objectives",
    "commissions",
    "alerts",
    "communications",
    "recursos",
    "clientes",
    "knowledge",
  ],

  ADMINISTRATIVA: [
    "situation",
    "commissions",
    "alerts",
    "communications",
    "recursos",
    "delegados",
    "clientes",
    "knowledge",
  ],

  CLIENTE: ["situation", "communications", "recursos", "knowledge"],

  CONSULTOR: ["situation", "communications", "recursos", "knowledge"],
};

/**
 * ✅ Bridge: rol real del sistema -> perfil de visibilidad
 *
 * Regla:
 * - SUPER_ADMIN -> MELQUISEDEC (sobirania)
 * - Coordinadores -> COORDINADOR
 * - Administrative -> ADMINISTRATIVA
 * - Delegate/KOL/Commission agent/Distributor -> DELEGADO o KOL según rol
 * - Client -> CLIENTE
 *
 * IMPORTANT: Si no sabemos el rol, devolvemos un perfil mínimo (CONSULTOR),
 * nunca el máximo. Esto evita “se ve TODO” por error.
 */
export function bridgeSystemRoleToVihoRole(roleRaw: unknown): VihoRole {
  const role = String(roleRaw ?? "").trim().toUpperCase();

  if (role === "SUPER_ADMIN") return "MELQUISEDEC";

  if (role === "COORDINATOR_COMMERCIAL" || role === "COORDINATOR_CECT") return "COORDINADOR";

  if (role === "ADMINISTRATIVE") return "ADMINISTRATIVA";

  if (role === "KOL") return "KOL";

  if (role === "DELEGATE" || role === "COMMISSION_AGENT" || role === "DISTRIBUTOR")
    return "DELEGADO";

  if (role === "CLIENT") return "CLIENTE";

  // default seguro (mínimo)
  return "CONSULTOR";
}

function indexRegistryByCode() {
  const m = new Map<TabCode, TabDefinition>();
  for (const t of TAB_REGISTRY) m.set(t.tab_code, t);
  return m;
}

/**
 * Entrada principal recomendada: rol real (DB)
 */
export function getVisibleTabsForSystemRole(role: unknown): TabDefinition[] {
  const vihoRole = bridgeSystemRoleToVihoRole(role);
  return getVisibleTabsForRole(vihoRole);
}

export function getVisibleTabsForRole(role: VihoRole): TabDefinition[] {
  const byCode = indexRegistryByCode();
  const codes = ROLE_VISIBILITY_MAP_V1[role] ?? [];
  const out: TabDefinition[] = [];

  for (const c of codes) {
    const t = byCode.get(c);
    if (t) out.push(t);
  }

  return out;
}

export function toPortalShellTabs(tabs: TabDefinition[]) {
  return tabs.map((t) => ({
    href: t.href,
    label: t.label,
  }));
}
