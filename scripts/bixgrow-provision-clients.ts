/**
 * VIHOLABS — BixGrow → Provision Clients
 *
 * For every affiliate in affiliate_accounts that has no linked client:
 *   1. Search Holded for a contact with that email (avoid duplicate)
 *   2. If not found → create Holded contact
 *   3. Create client in Viholabs (clients table) with holded_contact_id
 *   4. Create attribution event linking affiliate → new client
 *
 * Schedule: every 12h via GitHub Actions (bixgrow-provision-clients.yml)
 * Manual:   pnpm exec -- tsx scripts/bixgrow-provision-clients.ts
 *
 * Env vars:
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   HOLDED_API_KEY
 *   PREVIEW=true   (dry-run, no writes)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  holdedCreateContact,
  holdedFindContactByEmail,
} from "../src/lib/holded/holdedClient";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else dotenv.config();

function requireEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const preview = process.env.PREVIEW?.trim().toLowerCase() === "true";

  console.log("=== VIHOLABS bixgrow-provision-clients ===");
  console.log(`  preview : ${preview}`);
  console.log(`  time    : ${new Date().toISOString()}`);

  const supa = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // 1. Load all affiliates
  const { data: affiliates, error: affErr } = await supa
    .from("affiliate_accounts")
    .select("id, name, email, state_code")
    .not("email", "is", null)
    .order("name");

  if (affErr) throw new Error(`affiliates load: ${affErr.message}`);
  console.log(`\nAfiliados con email: ${(affiliates ?? []).length}`);

  let created = 0;
  let alreadyLinked = 0;
  let skipped = 0;
  let errors = 0;

  for (const aff of affiliates ?? [] as any[]) {
    const email: string = aff.email.toLowerCase().trim();

    // Check if already linked to any client
    const { data: existing } = await supa
      .from("affiliate_attribution_events")
      .select("id, client_id")
      .eq("affiliate_account_id", aff.id)
      .not("client_id", "is", null)
      .limit(1);

    if (existing?.length) {
      alreadyLinked++;
      continue;
    }

    // Check if a client with this email already exists in Viholabs
    const { data: existingClient } = await supa
      .from("clients")
      .select("id, name, holded_contact_id")
      .eq("contact_email", email)
      .maybeSingle();

    if (existingClient) {
      // Client exists but isn't linked — just create the attribution event
      console.log(`  → link existing client :: ${aff.name} → ${existingClient.name}`);
      if (!preview) {
        const eventHash = crypto.createHash("md5").update(`link_${aff.id}_${existingClient.id}`).digest("hex");
        await supa.from("affiliate_attribution_events").insert({
          affiliate_account_id: aff.id,
          client_id: existingClient.id,
          customer_email: email,
          source: "email_match",
          source_event_id: "AUTO_EMAIL_MATCH",
          event_hash: eventHash,
          event_at: new Date().toISOString(),
          state_code: "OPEN",
        });
      }
      created++;
      continue;
    }

    // Need to create: Holded contact + Viholabs client
    console.log(`\n  → provisioning :: ${aff.name} <${email}>`);

    try {
      let holdedContactId: string | null = null;

      if (!preview) {
        // Search Holded first to avoid duplicates
        console.log(`    searching Holded for ${email}...`);
        const found = await holdedFindContactByEmail(email);

        if (found) {
          holdedContactId = found.id;
          console.log(`    found existing Holded contact: ${found.id}`);
        } else {
          // Create new Holded contact
          console.log(`    creating Holded contact...`);
          const newContact = await holdedCreateContact({
            name: aff.name,
            email,
            type: 0,
            isperson: 1,
          });
          holdedContactId = newContact.id;
          console.log(`    created Holded contact: ${holdedContactId}`);
        }

        // Create Viholabs client
        const { data: newClient, error: clientErr } = await supa
          .from("clients")
          .insert({
            name: aff.name,
            contact_email: email,
            holded_contact_id: holdedContactId,
            status: "ACTIVE",
            state_code: "OPEN",
            source: "bixgrow_affiliate",
          })
          .select("id, name")
          .single();

        if (clientErr) {
          console.error(`    client insert error: ${clientErr.message}`);
          errors++;
          continue;
        }

        console.log(`    created Viholabs client: ${newClient.id}`);

        // Create attribution event
        const eventHash = crypto.createHash("md5").update(`provision_${aff.id}_${newClient.id}`).digest("hex");
        await supa.from("affiliate_attribution_events").insert({
          affiliate_account_id: aff.id,
          client_id: newClient.id,
          customer_email: email,
          source: "bixgrow_provision",
          source_event_id: "AUTO_PROVISION",
          event_hash: eventHash,
          event_at: new Date().toISOString(),
          state_code: "OPEN",
        });

        console.log(`    ✓ linked :: ${aff.name} → ${newClient.name}`);
      } else {
        console.log(`    [preview] would create Holded contact + Viholabs client for ${aff.name}`);
      }

      created++;
    } catch (e: any) {
      console.error(`    error :: ${aff.name}: ${e?.message ?? e}`);
      errors++;
    }
  }

  console.log("\n=== RESULT ===");
  console.log(JSON.stringify({
    ok: true,
    total_affiliates: (affiliates ?? []).length,
    already_linked: alreadyLinked,
    provisioned: created,
    skipped,
    errors,
    preview,
  }, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
