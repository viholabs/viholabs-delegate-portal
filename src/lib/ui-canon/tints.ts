// src/lib/ui-canon/tints.ts
/**
 * TINTS CANÒNICS
 * Només per representar estat, jerarquia o focus.
 * ❌ Prohibit ús decoratiu.
 */

export const CANON_TINTS = {
  authority: {
    subtle: "rgba(90,46,58,0.06)",
    soft: "rgba(90,46,58,0.12)",
    medium: "rgba(90,46,58,0.18)",
  },

  certification: {
    subtle: "rgba(199,174,106,0.12)",
    soft: "rgba(199,174,106,0.22)",
  },

  technicalAccent: {
    subtle: "rgba(242,106,33,0.12)",
  },

  surface: {
    muted: "rgba(255,255,255,0.85)",
  },
} as const;
