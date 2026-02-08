// src/lib/ui-canon/migration.ts
/**
 * MAPATGE DE MIGRACIÓ (LEGACY → CÀNON)
 *
 * IMPORTANT:
 * - Aquest fitxer NO aplica canvis a cap pantalla.
 * - És un contracte de migració per substituir colors hardcoded de forma mecànica.
 * - El mapping apunta a TOKENS CANÒNICS (no a hex legacy).
 *
 * Regla:
 * - Colors "SaaS/slate" (#111827 / rgba(17,24,39,...) ) són INTRUSOS i s'han d'eliminar.
 * - Gradients són PROHIBITS (es tractaran en un pas separat).
 */

export const LEGACY_COLOR_MAP: Record<string, string> = {
  // --- Core actual (legacy) → Cànon ---
  "#59313c": "CANON_COLORS.authority",
  "rgba(89,49,60,0.7)": "CANON_TINTS.authority.soft",
  "rgba(89,49,60,0.75)": "CANON_TINTS.authority.medium",
  "rgba(89,49,60,0.6)": "CANON_TINTS.authority.soft",
  "rgba(89,49,60,0.18)": "CANON_TINTS.authority.medium",
  "rgba(89,49,60,0.15)": "CANON_TINTS.authority.soft",
  "rgba(89,49,60,0.12)": "CANON_TINTS.authority.soft",
  "rgba(89,49,60,0.10)": "CANON_TINTS.authority.subtle",
  "rgba(89,49,60,0.06)": "CANON_TINTS.authority.subtle",
  "rgba(89, 49, 60, 0.18)": "CANON_TINTS.authority.medium",
  "rgba(89, 49, 60, 0.06)": "CANON_TINTS.authority.subtle",
  "rgba(89, 49, 60, 0.25)": "CANON_TINTS.authority.medium",
  "rgba(89, 49, 60, 0.22)": "CANON_TINTS.authority.medium",
  "rgba(89, 49, 60, 0.08)": "CANON_TINTS.authority.subtle",
  "rgba(89, 49, 60, 0.035)": "CANON_TINTS.authority.subtle",

  "#f28444": "CANON_COLORS.technicalAccent",
  "rgba(242,132,68,0.35)": "CANON_TINTS.technicalAccent.subtle",
  "rgba(242,132,68,0.14)": "CANON_TINTS.technicalAccent.subtle",
  "rgba(242, 132, 68, 0.35)": "CANON_TINTS.technicalAccent.subtle",
  "rgba(242, 132, 68, 0.14)": "CANON_TINTS.technicalAccent.subtle",

  // --- Neutres / superfícies ---
  "#ffffff": "CANON_COLORS.surface",
  "#fff": "CANON_COLORS.surface",
  "rgba(255,255,255,0.9)": "CANON_TINTS.surface.muted",
  "rgba(255,255,255,0.65)": "CANON_TINTS.surface.muted",
  "rgba(255, 255, 255, 1)": "CANON_COLORS.surface",

  // --- Textos “marró fosc” legacy (aproximació) ---
  "#2a1d20": "CANON_COLORS.authority",
  "rgba(42,29,32,0.65)": "CANON_TINTS.authority.soft",
  "rgba(42,29,32,0.7)": "CANON_TINTS.authority.soft",
  "rgba(42,29,32,0.85)": "CANON_TINTS.authority.medium",
  "rgba(42,29,32,0.9)": "CANON_TINTS.authority.medium",
  "rgba(42,29,32,0.8)": "CANON_TINTS.authority.medium",
  "rgba(42,29,32,0.55)": "CANON_TINTS.authority.subtle",

  // --- Estats operatius (aquí només mapegem a canònic “sobri”, no “lúdic”) ---
  "#4c8b5f": "CANON_COLORS.success",
  "#c04646": "CANON_COLORS.error",
  "#8f2d2d": "CANON_COLORS.error",
  "#2f6a44": "CANON_COLORS.success",
  "rgba(76,139,95,0.35)": "CANON_TINTS.certification.subtle",
  "rgba(76,139,95,0.15)": "CANON_TINTS.certification.subtle",
  "rgba(76,139,95,0.06)": "CANON_TINTS.certification.subtle",
  "rgba(192,70,70,0.35)": "CANON_TINTS.certification.subtle",
  "rgba(192,70,70,0.15)": "CANON_TINTS.certification.subtle",
  "rgba(192,70,70,0.06)": "CANON_TINTS.certification.subtle",

  // --- Ombres / línies (a revisar: el canònic tendeix a prohibir ús gratuït) ---
  "rgba(0,0,0,0.05)": "CANON_TINTS.authority.subtle",
  "rgba(0,0,0,0.06)": "CANON_TINTS.authority.subtle",
  "rgba(0,0,0,0.10)": "CANON_TINTS.authority.soft",
  "rgba(0, 0, 0, 0.10)": "CANON_TINTS.authority.soft",
  "rgba(0, 0, 0, 0.88)": "CANON_TINTS.authority.medium",
  "rgba(0, 0, 0, 0.62)": "CANON_TINTS.authority.soft",
  "rgba(0,0,0,.06)": "CANON_TINTS.authority.subtle",
  "rgba(0,0,0,.04)": "CANON_TINTS.authority.subtle",
};

export const LEGACY_COLOR_NOTES: Record<string, string> = {
  // Intrusos SaaS/slate: eliminar i substituir per CANON_COLORS.authority / tints authority
  "#111827": "INTRÚS (slate). Substituir per CANON_COLORS.authority o tint d'autoritat segons jerarquia.",
  "rgba(17,24,39,0.65)": "INTRÚS (slate). Substituir per CANON_TINTS.authority.soft.",
  "rgba(17,24,39,0.6)": "INTRÚS (slate). Substituir per CANON_TINTS.authority.subtle/soft.",
  "rgba(17,24,39,0.55)": "INTRÚS (slate). Substituir per CANON_TINTS.authority.subtle.",
  "rgba(17,24,39,0.7)": "INTRÚS (slate). Substituir per CANON_TINTS.authority.soft.",
  "rgba(17,24,39,0.62)": "INTRÚS (slate). Substituir per CANON_TINTS.authority.soft.",

  // Paleta legacy “soft/rose/gold” (cosmètica): eliminar en favor de cànon (background/certification)
  "#d9c2ba": "LEGACY soft. Eliminar. Si és separador → tints authority/certification; si és fons → CANON_COLORS.background.",
  "#db9d87": "LEGACY rose. Eliminar. No té equivalència canònica directa.",
  "#f8ae4e": "LEGACY gold. Substituir per CANON_COLORS.certification (gold mate canònic).",
  "#fbf6f4": "LEGACY background. Substituir per CANON_COLORS.background (#FBF6EC).",
  "#faf8f7": "LEGACY background. Substituir per CANON_COLORS.background (#FBF6EC).",
  "#f6f2f0": "LEGACY bg-soft. Substituir per CANON_COLORS.background (#FBF6EC).",
  "#f3e7e2": "LEGACY tint. Eliminar. Substituir per CANON_TINTS.authority.subtle o certification.subtle segons cas.",
  "#e6e1de": "LEGACY border. Substituir per tint d'autoritat (subtle/soft) segons jerarquia.",
  "#e5d8d2": "LEGACY border. Substituir per tint d'autoritat (subtle/soft) segons jerarquia.",
  "#ddd": "LEGACY border. Substituir per tint d'autoritat (subtle/soft) segons jerarquia.",

  // Altres (no prioritaris ara)
  "#171717": "Text genèric. Substituir per CANON_COLORS.authority o tint d'autoritat.",
  "#1f1f1f": "Text genèric. Substituir per CANON_COLORS.authority o tint d'autoritat.",
  "#1b1b1b": "Text genèric. Substituir per CANON_COLORS.authority o tint d'autoritat.",
  "#7a6a65": "Muted legacy. Substituir per CANON_TINTS.authority.soft.",
  "#6e5a60": "Muted legacy. Substituir per CANON_TINTS.authority.soft.",
  "#6b8cae": "Info legacy. No canònic. Revisar si realment representa estat; si no, eliminar.",
  "#5b1f14": "Text accent legacy. Eliminar o mapar a autoritat segons cas.",
  "#7a2f12": "Text accent legacy. Eliminar o mapar a autoritat segons cas.",

  // Gradients: prohibits (tractarem en un pas dedicat)
  "conic-gradient": "PROHIBIT. Cal substituir per indicador sobrer (sense gradient).",
  "linear-gradient": "PROHIBIT. El fons global ha de ser pla (CANON_COLORS.background).",
};
