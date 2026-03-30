/* eslint-disable no-console */

import { runHoldedInvoicesIncrementalImport } from "../src/lib/holded/holdedImportIncrementalRunner";

function parseEnvString(name: string): string | undefined {
  const v = String(process.env[name] ?? "").trim();
  return v ? v : undefined;
}

function parseEnvLimit(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${name}: "${raw}"`);
  }

  return Math.floor(n);
}

async function main() {
  process.env.TZ = process.env.TZ || "Europe/Madrid";

  const limit = parseEnvLimit("VIHO_LIMIT", 500);
  const since = parseEnvString("VIHO_SINCE");
  const until = parseEnvString("VIHO_UNTIL");

  console.log("[GH][HOLDed] Starting incremental import");
  console.log(
    JSON.stringify(
      {
        limit,
        since: since ?? null,
        until: until ?? null,
        tz: process.env.TZ ?? null,
      },
      null,
      2
    )
  );

  const result = await runHoldedInvoicesIncrementalImport({
    limit,
    since,
    until,
  });

  console.log("[GH][HOLDed] Result:");
  console.log(JSON.stringify(result, null, 2));

  const failed = Number((result as any)?.failed ?? 0);
  const imported = Number((result as any)?.imported ?? 0);
  const skipped = Number((result as any)?.skipped ?? 0);
  const advanced = Boolean((result as any)?.advanced ?? false);

  console.log(`[GH][HOLDed] imported=${imported}`);
  console.log(`[GH][HOLDed] skipped=${skipped}`);
  console.log(`[GH][HOLDed] failed=${failed}`);
  console.log(`[GH][HOLDed] advanced=${advanced}`);

  if (failed > 0) {
    throw new Error(`Incremental import finished with failed=${failed}`);
  }

  console.log("[GH][HOLDed] OK");
}

main().catch((err) => {
  console.error("[GH][HOLDed] FATAL");
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});