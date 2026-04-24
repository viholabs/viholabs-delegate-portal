/**
 * VIHOLABS — BixGrow Affiliate Sync
 *
 * What this does:
 *   1. Fetches ALL affiliates from BixGrow API
 *   2. Upserts them into affiliate_accounts (keyed on affiliate_external_id)
 *   3. For each affiliate that has an email matching an existing client,
 *      creates an affiliate_attribution_events link (source: "bixgrow_sync")
 *   4. Logs a summary
 *
 * Usage:
 *   pnpm exec -- tsx scripts/bixgrow-sync-affiliates.ts
 *
 * Env vars:
 *   BIXGROW_API_KEY           required
 *   BIXGROW_APP_ID            required
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL   required
 *   SUPABASE_SERVICE_ROLE_KEY  required
 *   PREVIEW   "true" = dry-run  (default: false)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { listBixGrowAffiliates, isBixGrowConfigured } from "../src/lib/bixgrow/bixgrowClient";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else dotenv.config();

function requireSupabaseUrl(): string {
  return process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

function requireEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const supabaseUrl = requireSupabaseUrl();
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const preview = process.env.PREVIEW?.trim().toLowerCase() === "true";

  console.log("=== VIHOLABS bixgrow-sync-affiliates ===");
  console.log(`  preview : ${preview}`);

  if (!isBixGrowConfigured()) {
    console.error("BixGrow not configured (missing BIXGROW_API_KEY / BIXGROW_APP_ID)");
    process.exit(1);
  }

  const supa = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // 1. Fetch affiliates from BixGrow
  console.log("\n1) Fetching affiliates from BixGrow...");
  const affiliates = await listBixGrowAffiliates({ limit: 500 });
  console.log(`   found ${affiliates.length} affiliates`);

  if (affiliates.length === 0) {
    console.log("Nothing to sync.");
    return;
  }

  // 2. Load existing affiliate_accounts keyed by affiliate_external_id
  console.log("\n2) Loading existing affiliate_accounts from DB...");
  const { data: existingRows } = await supa
    .from("affiliate_accounts")
    .select("id, affiliate_external_id, email");
  const byExternalId = new Map(
    (existingRows ?? []).map((r: any) => [String(r.affiliate_external_id ?? ""), r])
  );
  const byEmail = new Map(
    (existingRows ?? [])
      .filter((r: any) => r.email)
      .map((r: any) => [String(r.email).toLowerCase(), r])
  );

  // 3. Load existing clients by email for auto-linking
  console.log("\n3) Loading clients for email matching...");
  const { data: clientRows } = await supa
    .from("clients")
    .select("id, contact_email, name")
    .not("contact_email", "is", null);
  const clientByEmail = new Map(
    (clientRows ?? []).map((r: any) => [String(r.contact_email ?? "").toLowerCase(), r])
  );

  // 4. Upsert affiliates
  console.log("\n4) Upserting affiliates...");
  let inserted = 0, updated = 0, linked = 0, errors = 0;

  for (const aff of affiliates) {
    if (!aff.id) { errors++; continue; }

    const bixgrowId = String(aff.id);
    const email = aff.email?.toLowerCase() ?? null;
    const displayName = aff.name ||
      [aff.first_name, aff.last_name].filter(Boolean).join(" ") ||
      email ||
      bixgrowId;

    const existing = byExternalId.get(bixgrowId) ?? (email ? byEmail.get(email) : null);

    const row: Record<string, unknown> = {
      name: displayName,
      email: aff.email ?? null,
      affiliate_external_id: bixgrowId,
      state_code: aff.status === "active" || aff.status === "ACTIVE" ? "OPEN" : "OPEN",
      commission_value: aff.commission_value ?? null,
      commission_type: aff.commission_type ?? null,
      referral_code: aff.referral_code ?? null,
      balance: aff.balance ?? null,
      paid_out: aff.paid_out ?? null,
      source: "bixgrow",
      source_meta: { bixgrow_raw: aff },
      synced_at: new Date().toISOString(),
    };

    let affiliateAccountId: string | null = existing?.id ?? null;

    if (!preview) {
      if (existing) {
        const { error } = await supa
          .from("affiliate_accounts")
          .update(row)
          .eq("id", existing.id);
        if (error) { console.error(`  update error ${bixgrowId}: ${error.message}`); errors++; continue; }
        updated++;
        console.log(`  updated :: ${displayName} (${bixgrowId})`);
      } else {
        const { data: ins, error } = await supa
          .from("affiliate_accounts")
          .insert(row)
          .select("id")
          .single();
        if (error) { console.error(`  insert error ${bixgrowId}: ${error.message}`); errors++; continue; }
        affiliateAccountId = ins.id;
        inserted++;
        console.log(`  inserted :: ${displayName} (${bixgrowId})`);
      }
    } else {
      console.log(`  [preview] would ${existing ? "update" : "insert"} :: ${displayName} (${bixgrowId})`);
      if (existing) updated++; else inserted++;
    }

    // 5. Auto-link affiliate to matching client by email
    if (affiliateAccountId && email) {
      const matchedClient = clientByEmail.get(email);
      if (matchedClient) {
        // Check if already linked
        const { data: existingLink } = await supa
          .from("affiliate_attribution_events")
          .select("id")
          .eq("affiliate_account_id", affiliateAccountId)
          .eq("client_id", matchedClient.id)
          .eq("source", "bixgrow_sync")
          .limit(1);

        if (!existingLink?.length) {
          if (!preview) {
            const { error } = await supa.from("affiliate_attribution_events").insert({
              source: "bixgrow_sync",
              source_event_id: "AFFILIATE_CLIENT_MATCH",
              affiliate_account_id: affiliateAccountId,
              client_id: matchedClient.id,
              customer_email: email,
              bixgrow_affiliate_id: bixgrowId,
              event_at: new Date().toISOString(),
              state_code: "OPEN",
            });
            if (!error) {
              linked++;
              console.log(`    linked to client :: ${matchedClient.name} (${email})`);
            }
          } else {
            console.log(`    [preview] would link to client :: ${matchedClient.name} (${email})`);
            linked++;
          }
        }
      }
    }
  }

  console.log("\n=== RESULT ===");
  console.log(JSON.stringify({
    ok: true,
    total: affiliates.length,
    inserted,
    updated,
    client_links_created: linked,
    errors,
    preview,
  }, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
