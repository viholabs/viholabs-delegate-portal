import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else dotenv.config();

import { holdedFetchJson } from "../src/lib/holded/holdedFetch";

async function main() {
  const docNumber = process.argv[2];
  if (!docNumber) {
    console.error("Usage: pnpm -s tsx scripts/holded-find-invoice-by-docnumber.ts <DOCNUMBER>");
    process.exit(2);
  }

  // List Documents: docType invoice. (Holded soporta query params; si ignora alguno, igual nos sirve el listado)
 const list: any[] = await holdedFetchJson("invoice?sort=desc&limit=200");
  const norm = (s: any) => String(s ?? "").trim();
  const hit = list.find((d) => norm(d?.docNumber) === norm(docNumber));

  console.log("[find] list_count", Array.isArray(list) ? list.length : null);

  if (!hit) {
    console.log("[find] NOT_FOUND", { docNumber });
    // Para debug: muestra los últimos docNumbers
    console.log(
      "[find] sample_docNumbers",
      (list || []).slice(0, 20).map((d) => ({ id: d?.id ?? d?._id ?? null, docNumber: d?.docNumber ?? null }))
    );
    process.exit(0);
  }

  console.log("[find] FOUND", {
    id: hit?.id ?? null,
    _id: hit?._id ?? null,
    docNumber: hit?.docNumber ?? null,
    date: hit?.date ?? null,
    contactName: hit?.contactName ?? hit?.contact?.name ?? null,
  });
}

main().catch((e) => {
  console.error("[find] FATAL", e);
  process.exit(1);
});
