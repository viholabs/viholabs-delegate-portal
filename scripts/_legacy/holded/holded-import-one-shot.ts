// ✅ Deterministic env load for one-shot scripts (outside Next.js)
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config(); // fallback to .env
}

import { supabaseAdmin as supabaseAdminClient } from "../src/lib/supabase/admin";
import { importOneHoldedInvoiceById } from "../src/lib/holded/holdedInvoiceImporter";

async function main() {
  const holdedId = process.argv[2];
  if (!holdedId) {
    console.error("Usage: pnpm -s tsx scripts/holded-import-one-shot.ts <HOLDED_ID>");
    process.exit(2);
  }

  const keyLen = String(process.env.HOLDED_API_KEY ?? "").trim().length;
  console.log("[one_shot] ENV", { HOLDED_API_KEY_len: keyLen });

  console.log("[one_shot] START", { holdedId });

  const supabase = (typeof (supabaseAdminClient as any) === "function") ? (supabaseAdminClient as any)() : (supabaseAdminClient as any);
  const r = await importOneHoldedInvoiceById(supabase, holdedId);

  console.log("[one_shot] RESULT_JSON", JSON.stringify(r));
}

main().catch((e) => {
  console.error("[one_shot] FATAL", e);
  process.exit(1);
});
