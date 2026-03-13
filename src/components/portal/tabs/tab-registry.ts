// src/components/portal/tabs/tab-registry.ts

export type CanonicalTabCode =
  | "situation"
  | "clients"
  | "billing"
  | "resources"
  | "el_elyon";

export type LegacyTabCode =
  | "situation"
  | "clients"
  | "billing"
  | "resources"
  | "el_elyon"
  | "orders"
  | "orders.new"
  | "tech_block";

export type TabDefinition = {
  tab_code: CanonicalTabCode;
  label: string;
  href: string;
  melquisedecOnly?: boolean;
};

function shellHref(tab: CanonicalTabCode): string {
  return `/control-room/shell?tab=${encodeURIComponent(tab)}`;
}

export const TAB_REGISTRY: TabDefinition[] = [
  {
    tab_code: "situation",
    label: "Situation",
    href: shellHref("situation"),
  },
  {
    tab_code: "clients",
    label: "Clients",
    href: shellHref("clients"),
  },
  {
    tab_code: "billing",
    label: "Facturación",
    href: shellHref("billing"),
  },
  {
    tab_code: "resources",
    label: "Recursos",
    href: shellHref("resources"),
  },
  {
    tab_code: "el_elyon",
    label: "El-Elyon",
    href: shellHref("el_elyon"),
    melquisedecOnly: true,
  },
];

export function normalizeTabCode(
  raw: string | null | undefined,
): CanonicalTabCode {
  const value = String(raw ?? "").trim().toLowerCase();

  switch (value) {
    case "situation":
      return "situation";

    case "clients":
    case "clientes":
    case "delegados":
      return "clients";

    case "billing":
    case "orders":
    case "orders.new":
    case "commissions":
      return "billing";

    case "resources":
    case "recursos":
    case "tech_block":
    case "knowledge":
    case "obexperience":
    case "communications":
    case "alerts":
    case "clinical_criteria":
    case "consultas":
    case "casos":
    case "evolution":
    case "objectives":
      return "resources";

    case "el_elyon":
      return "el_elyon";

    default:
      return "situation";
  }
}

export function getCanonicalTabs(params?: {
  isMelquisedec?: boolean;
}): TabDefinition[] {
  const isMelquisedec = params?.isMelquisedec === true;

  return TAB_REGISTRY.filter((tab) => {
    if (tab.melquisedecOnly && !isMelquisedec) {
      return false;
    }

    return true;
  });
}