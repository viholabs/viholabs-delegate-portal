import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else dotenv.config();

import { holdedFetchJson } from "../src/lib/holded/holdedFetch";

function pickLine(p: any) {
  const keys = Object.keys(p || {}).sort();
  return {
    keys,
    name: p?.name ?? null,
    sku: p?.sku ?? null,
    productId: p?.productId ?? null,
    variantId: p?.variantId ?? null,
    units: p?.units ?? null,
    price: p?.price ?? null,
    total: p?.total ?? null,
    subtotal: p?.subtotal ?? null,
    desc: p?.desc ?? null,
    description: p?.description ?? null,

    // camps alternatius (per detectar Possibilitat B)
    code: p?.code ?? null,
    reference: p?.reference ?? null,
    itemCode: p?.itemCode ?? null,
    barcode: p?.barcode ?? null,
  };
}

async function main() {
  const holdedId = process.argv[2];
  if (!holdedId) {
    console.error("Usage: pnpm -s tsx scripts/holded-dump-invoice-lines.ts <HOLDED_INVOICE_ID>");
    process.exit(2);
  }

  const detail: any = await holdedFetchJson(`/invoicing/v1/documents/invoice/${holdedId}`);

  const products = Array.isArray(detail?.products) ? detail.products : [];
  console.log("[dump] invoice", {
    id: detail?.id ?? detail?._id ?? null,
    docNumber: detail?.docNumber ?? null,
    date: detail?.date ?? null,
    products_count: products.length,
  });

  const lines = products.map(pickLine);
  console.log(JSON.stringify(lines, null, 2));
}

main().catch((e) => {
  console.error("[dump] FATAL", e);
  process.exit(1);
});
