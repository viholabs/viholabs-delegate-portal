/**
 * VIHOLABS — HOLDED FETCH JSON (CANÒNIC)
 *
 * Canon:
 * - holdedFetch.ts és la font de veritat (single entry-point)
 * - Aquest fitxer només re-exporta per compatibilitat i claredat semàntica
 */

export {
  holdedFetchJson,
  HOLDED_API_BASE,
  HoldedError,
  type HoldedFetchOptions,
} from "./holdedFetch";
