import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else dotenv.config();

import { holdedFetch } from "../src/lib/holded/holdedFetch";

function pickLine(p: any) {
  const keys = Object.keys(p || {}).sort();
  return {
    keys,
    name: p?.name ?? null,
    sku: p?.sku ?? null,
    productId: p?.productId ?? p?.product_id ?? null,
    variantId: p?.variantId ?? p?.variant_id ?? null,
    units: p?.units ?? p?.quantity ?? null,
    price: p?.price ?? p?.unitPrice ?? p?.unit_price ?? null,
    desc: p?.desc ?? null,
    description: p?.description ?? null,

    // alternatius per detectar si SKU viu en un altre camp
    code: p?.code ?? null,
    reference: p?.reference ?? null,
    itemCode: p?.itemCode ?? null,
    barcode: p?.barcode ?? null,
  };
}

async function main() {
  const holdedId = process.argv[2];
  if (!holdedId) {
    console.error("Usage: pnpm -s tsx scripts/holded-dump-via-holdedFetch.ts <HOLDED_ID>");
    process.exit(2);
  }

  const detail: any = await holdedFetch<any>("invoice", holdedId);
  const products = Array.isArray(detail?.products) ? detail.products : [];

  console.log("[dump_via_holdedFetch] meta", {
    id: detail?.id ?? detail?._id ?? null,
    docNumber: detail?.docNumber ?? null,
    date: detail?.date ?? null,
    keys: Object.keys(detail || {}).sort(),
    products_count: products.length,
  });

  console.log(JSON.stringify(products.map(pickLine), null, 2));
}

main().catch((e) => {
  console.error("[dump_via_holdedFetch] FATAL", e);
  process.exit(1);
});
