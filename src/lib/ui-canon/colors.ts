// src/lib/ui-canon/colors.ts
/**
 * IDENTITAT VISUAL CANÒNICA — COLORS
 * Font única de veritat visual del Portal Operatiu VIHOLABS
 *
 * ❌ No decoració
 * ❌ No gradients
 * ❌ No reinterpretacions
 */

export const CANON_COLORS = {
  /** Fons institucional (marfil canònic) */
  background: "#FBF6EC",

  /** Text i autoritat principal */
  authority: "#5A2E3A",

  /** Certificació / validació / jerarquia */
  certification: "#C7AE6A",
  certificationSoft: "#D6C28A",

  /** Accent tècnic restringit (acció puntual, no ambient) */
  technicalAccent: "#F26A21",

  /** Blanc funcional (superfícies puntuals) */
  surface: "#FFFFFF",

  /** Error / alerta crítica */
  error: "#8F2D2D",

  /** Èxit operatiu (sense eufòria visual) */
  success: "#4C8B5F",
} as const;
