/**
 * VIHOLABS — TAB REGISTRY (CANÓNICO V1)
 *
 * Reglas:
 * - tab_code = identidad estable (NO cambiar)
 * - label = texto visible
 * - href = navegación (single screen /control-room/shell?tab=...)
 */

export type TabCode =
  | "situation"
  | "evolution"
  | "objectives"
  | "commissions"
  | "alerts"
  | "communications"
  | "clinical_criteria"
  | "tech_block"
  | "consultas"
  | "casos"
  | "recursos"
  | "delegados"
  | "clientes"
  | "knowledge"
  | "obexperience"
  | "el_elyon"; // ✅ NUEVO SOBERANO

export type TabDefinition = {
  tab_code: TabCode;
  label: string;
  href: string;
};

function shellHref(tab: TabCode) {
  return `/control-room/shell?tab=${encodeURIComponent(tab)}`;
}

export const TAB_REGISTRY: TabDefinition[] = [
  { tab_code: "situation", label: "Situation", href: shellHref("situation") },
  { tab_code: "evolution", label: "Evolución", href: shellHref("evolution") },
  { tab_code: "objectives", label: "Objetivos", href: shellHref("objectives") },
  { tab_code: "commissions", label: "Comisiones", href: shellHref("commissions") },
  { tab_code: "alerts", label: "Alertas", href: shellHref("alerts") },
  { tab_code: "communications", label: "Comunicaciones", href: shellHref("communications") },

  { tab_code: "clinical_criteria", label: "Criterio Clínico", href: shellHref("clinical_criteria") },
  { tab_code: "tech_block", label: "Bloc Técnico", href: shellHref("tech_block") },

  { tab_code: "consultas", label: "Consultas", href: shellHref("consultas") },
  { tab_code: "casos", label: "Casos", href: shellHref("casos") },
  { tab_code: "recursos", label: "Recursos", href: shellHref("recursos") },

  { tab_code: "delegados", label: "Delegados", href: shellHref("delegados") },
  { tab_code: "clientes", label: "Clientes", href: shellHref("clientes") },

  { tab_code: "knowledge", label: "Akademia", href: shellHref("knowledge") },
  { tab_code: "obexperience", label: "Obexperience", href: shellHref("obexperience") },

  // ✅ NUEVO — SOLO MELQUISEDEC
  { tab_code: "el_elyon", label: "El-Elyon", href: shellHref("el_elyon") },
];
