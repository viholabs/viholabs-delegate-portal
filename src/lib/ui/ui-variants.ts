/**
 * VIHOLABS — UI Variants (minimal canonical runtime)
 *
 * IMPORTANT:
 * - Variants canvien només presentació via tokens (data-ui-variant)
 * - No canvien negoci ni permisos
 *
 * En aquest repo nou encara no hi ha context d'actor/flags per decidir variant,
 * així que el comportament canònic mínim és: B2_PREMIUM_PERSONAL per defecte.
 */

export type UiVariant = "A1_EXECUTIU" | "B1_PREMIUM" | "B2_PREMIUM_PERSONAL";

export function resolveUiVariant(): UiVariant {
  return "B2_PREMIUM_PERSONAL";
}
