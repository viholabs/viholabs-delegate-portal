// scripts/reimport_holded_ids.ts
/**
 * VIHOLABS — Forced reimport by Holded IDs (NO HTTP, NO tunnel)
 * Canon:
 * - Deterministic
 * - Calls importOneHoldedInvoiceById directly
 * - Uses supabaseAdmin (service role)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { importOneHoldedInvoiceById } from "@/lib/holded/holdedInvoiceImporter";

async function main() {
  const ids = process.argv.slice(2).map((s) => String(s || "").trim()).filter(Boolean);

  if (ids.length === 0) {
    console.error("USAGE: pnpm -s tsx scripts/reimport_holded_ids.ts <holded_id_1> <holded_id_2> ...");
    process.exit(2);
  }

  const supabase = supabaseAdmin();

  const results: any[] = [];

  for (const holdedId of ids) {
    const started = new Date().toISOString();
    const r = await importOneHoldedInvoiceById(supabase, holdedId);
    const finished = new Date().toISOString();

    if (r.ok) {
      results.push({ holded_id: holdedId, ok: true, started, finished });
      continue;
    }

    results.push({
      holded_id: holdedId,
      ok: false,
      step: (r as any)?.err?.step ?? null,
      error: (r as any)?.err?.error ?? null,
      meta: (r as any)?.err?.meta ?? null,
      started,
      finished,
    });
  }

  console.log(JSON.stringify({ ok: true, n: results.length, results }, null, 2));
}

main().catch((e) => {
  console.error("FATAL", e?.message ?? e);
  process.exit(1);
});