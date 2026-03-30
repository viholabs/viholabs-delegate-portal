// scripts/holded-debug-invoice.ts
/**
 * Debug de una factura Holded por ID.
 * Uso:
 *   pnpm exec -- tsx scripts/holded-debug-invoice.ts <holded_invoice_id>
 */

import { holdedFetch } from "@/lib/holded/holdedFetch";

function pick(obj: any, keys: string[]) {
  const out: Record<string, any> = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

async function main() {
  const id = String(process.argv[2] ?? "").trim();
  if (!id) {
    console.error("Falta argumento: <holded_invoice_id>");
    process.exit(2);
  }

  const detail: any = await holdedFetch<any>("invoice", id);

  console.log("=== TOP LEVEL KEYS ===");
  console.log(Object.keys(detail || {}).sort());

  console.log("\n=== COMMON FIELDS ===");
  console.log(
    pick(detail, [
      "id",
      "_id",
      "docNumber",
      "date",
      "currency",
      "subtotal",
      "tax",
      "total",
      "contactId",
      "clientId",
      "customerId",
      "contact",
      "client",
      "customer",
      "contactName",
    ])
  );

  const products = Array.isArray(detail?.products) ? detail.products : [];
  console.log(`\n=== PRODUCTS: count=${products.length} ===`);

  if (products.length > 0) {
    const p0 = products[0];
    console.log("\n--- PRODUCT[0] KEYS ---");
    console.log(Object.keys(p0 || {}).sort());

    console.log("\n--- PRODUCT[0] SAMPLE ---");
    console.log(
      pick(p0, [
        "name",
        "description",
        "units",
        "price",
        "tax",
        "subtotal",
        "total",
        "productId",
        "variantId",
        "sku",
        "reference",
        "ref",
        "code",
        "product",
        "variant",
      ])
    );
  }

  console.log("\n=== RAW DETAIL (stringified) ===");
  console.log(JSON.stringify(detail, null, 2));
}

main().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});