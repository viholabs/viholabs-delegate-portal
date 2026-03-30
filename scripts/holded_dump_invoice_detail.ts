import { holdedFetch } from "@/lib/holded/holdedFetch";

async function main() {
  const docType = process.argv[2];
  const id = process.argv[3];

  if (!docType || !id) {
    console.error("Usage: pnpm -s tsx scripts/holded_dump_invoice_detail.ts <docType> <holded_id>");
    process.exit(1);
  }

  const detail = await holdedFetch<any>(docType, id);

  const products = Array.isArray(detail?.products) ? detail.products : [];
  const productKeys = products.map((p: any) => Object.keys(p || {}).sort());
  const topKeys = Object.keys(detail || {}).sort();

  console.log(
    JSON.stringify(
      {
        docType,
        holded_id: id,
        top_level_keys: topKeys,
        n_products: products.length,
        products_keys: productKeys,
        products_sample: products.slice(0, 5),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("[dump] FATAL", e);
  process.exit(1);
});