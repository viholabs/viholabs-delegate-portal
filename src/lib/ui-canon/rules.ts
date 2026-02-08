// src/lib/ui-canon/rules.ts
/**
 * REGLES CANÒNIQUES DE LA UI
 * Aquestes normes NO són opcionals.
 */

export const UI_CANON_RULES = {
  /** ❌ Prohibit qualsevol gradient decoratiu */
  forbidGradients: true,

  /** ❌ Prohibit color hardcoded fora del cànon */
  forbidHexOutsideCanon: true,

  /** ❌ Prohibit ús emocional del color */
  forbidDecorativeColor: true,

  /** ❌ Prohibit “look SaaS / friendly” */
  forbidSaasAesthetics: true,

  /** ✅ El color només pot representar estat, autoritat o jerarquia */
  colorPurpose: "STATE_AUTHORITY_ONLY",
} as const;
