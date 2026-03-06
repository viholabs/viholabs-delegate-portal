type BundleItem = { sku: string; quantity: number; unit_price_override: number | null };
type BundleDef = { sku: string; title: string | null; description: string | null; items: BundleItem[] };

export type LineDraft = { sku: string; quantity: number; unit_price: number | null };

function safeStr(v: any): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toNum(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * applyBundle()
 * Convierte un bundle en líneas.
 * Copia literal de la lógica actual (sin React).
 */
export function applyBundle(bundle: BundleDef): LineDraft[] {
  const newLines: LineDraft[] = bundle.items.map((it) => ({
    sku: it.sku,
    quantity: Math.max(1, Math.floor(toNum(it.quantity, 1))),
    unit_price: it.unit_price_override == null ? null : it.unit_price_override,
  }));

  return newLines;
}

/**
 * Utilidad opcional para aplicar bundle por SKU en una Map existente.
 * (No cambia comportamiento; solo evita duplicar el bloque en el componente.)
 */
export function applyBundleBySku(bundlesBySku: Map<string, BundleDef>, chosenSku: string): LineDraft[] | null {
  const sku = safeStr(chosenSku).trim();
  if (!sku) return null;

  const bundle = bundlesBySku.get(sku);
  if (bundle && bundle.items.length > 0) return applyBundle(bundle);

  return null;
}