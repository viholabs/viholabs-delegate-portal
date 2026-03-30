import crypto from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

type HoldedProduct = Record<string, unknown>;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return v.trim();
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;

  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "si", "sí"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;

  return null;
}

function pickHoldedId(row: HoldedProduct): string {
  const candidates = [row.id, row._id, row.productId];

  for (const c of candidates) {
    const v = asText(c);
    if (v) return v;
  }

  throw new Error(`Product without holded id: ${JSON.stringify(row)}`);
}

async function fetchAllHoldedProducts(apiKey: string): Promise<HoldedProduct[]> {
  const res = await fetch("https://api.holded.com/api/invoicing/v1/products", {
    method: "GET",
    headers: {
      key: apiKey,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Holded products fetch failed: HTTP ${res.status} :: ${body}`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error("Unexpected Holded response: expected array");
  }

  return data as HoldedProduct[];
}

async function main(): Promise<void> {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  console.log("1) Fetching Holded products...");
  const allProducts = await fetchAllHoldedProducts(holdedApiKey);
  console.log(`   OK: ${allProducts.length} productos recibidos`);

  const nowIso = new Date().toISOString();

  const rawRows = allProducts.map((row) => ({
    holded_id: pickHoldedId(row),
    payload: row,
    source_endpoint: "/api/invoicing/v1/products",
    source_hash: sha256(JSON.stringify(row)),
    fetched_at: nowIso,
  }));

  console.log("2) Upserting holded_products_raw...");
  {
    const { error } = await supabase
      .from("holded_products_raw")
      .upsert(rawRows, { onConflict: "holded_id" });

    if (error) {
      throw new Error(`Supabase upsert holded_products_raw failed: ${error.message}`);
    }
  }

  const projectedRows = allProducts.map((row) => ({
    holded_id: pickHoldedId(row),
    name: asText(row.name),
    description: asText(row.desc ?? row.description),
    sku: asText(row.sku),
    barcode: asText(row.barcode),
    type: asText(row.type),
    kind: asText(row.kind),
    category: asText(row.category),
    sales_price: asNum(row.sellPrice ?? row.salesPrice ?? row.price),
    purchase_price: asNum(row.purchasePrice ?? row.costPrice),
    tax: asText(row.tax),
    stock: asNum(row.stock),
    active: asBool(row.active),
    raw_payload: row,
    fetched_at: nowIso,
  }));

  console.log("3) Upserting holded_products...");
  {
    const { error } = await supabase
      .from("holded_products")
      .upsert(projectedRows, { onConflict: "holded_id" });

    if (error) {
      throw new Error(`Supabase upsert holded_products failed: ${error.message}`);
    }
  }

  console.log("DONE");
  console.log(`Imported raw     : ${rawRows.length}`);
  console.log(`Imported current : ${projectedRows.length}`);
}

main().catch((err) => {
  console.error("ERROR");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});