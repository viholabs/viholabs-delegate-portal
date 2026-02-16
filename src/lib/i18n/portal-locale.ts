// src/lib/i18n/portal-locale.ts

export type PortalLocale = "es-ES" | "ca-ES" | "en-GB";

export type PortalLang = "es" | "ca" | "en" | "fr";

export function langFromLocale(locale: string | null | undefined): PortalLang {
  const v = String(locale ?? "").trim();
  if (v === "ca-ES") return "ca";
  if (v === "en-GB") return "en";
  return "es";
}

export function normalizePortalLocale(v: unknown): PortalLocale {
  const s = String(v ?? "").trim();
  if (s === "es-ES") return "es-ES";
  if (s === "ca-ES") return "ca-ES";
  if (s === "en-GB") return "en-GB";
  return "es-ES";
}

/**
 * ✅ Canon i pragmatisme:
 * - NO usem navigator
 * - NO usem document.lang
 * - NO inventem localStorage
 * - Source existent: el contracte UI i el patró del Dashboard ("es-ES")
 *
 * Avui, si no hi ha cap mecanisme explícit, el portal és "es-ES".
 */
export function getPortalLocaleFromUrl(): PortalLocale {
  try {
    const u = new URL(window.location.href);
    // suport opcional futur: ?locale=es-ES|ca-ES|en-GB
    const qp = u.searchParams.get("locale");
    if (qp) return normalizePortalLocale(qp);
  } catch {
    // ignore
  }
  return "es-ES";
}
