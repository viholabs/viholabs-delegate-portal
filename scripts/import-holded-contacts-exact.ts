import crypto from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

type HoldedContact = Record<string, unknown>;

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

function asJson(v: unknown): unknown {
  return v === undefined ? null : v;
}

function pickHoldedId(row: HoldedContact): string {
  const candidates = [
    row.id,
    row._id,
    row.contactId,
  ];

  for (const c of candidates) {
    const v = asText(c);
    if (v) return v;
  }

  throw new Error(`Contact without holded id: ${JSON.stringify(row)}`);
}

function pickType(row: HoldedContact): string | null {
  return (
    asText(row.type) ??
    asText(row.contactType) ??
    asText(row.kind) ??
    null
  );
}

function looksLikeClient(row: HoldedContact): boolean {
  const t = (pickType(row) ?? "").toLowerCase();

  if (["client", "customer", "cliente"].includes(t)) return true;

  // Fallback conservador si Holded no trae tipo claro:
  // mantenemos todos los contactos y luego puedes filtrar en SQL
  return true;
}

async function fetchAllHoldedContacts(apiKey: string): Promise<HoldedContact[]> {
  const url = "https://api.holded.com/api/invoicing/v1/contacts";
  const res = await fetch(url, {
    method: "GET",
    headers: {
      key: apiKey,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Holded contacts fetch failed: HTTP ${res.status} :: ${body}`);
  }

  const data = (await res.json()) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected Holded response: expected array`);
  }

  return data as HoldedContact[];
}

async function main(): Promise<void> {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  console.log("1) Fetching Holded contacts...");
  const allContacts = await fetchAllHoldedContacts(holdedApiKey);
  console.log(`   OK: ${allContacts.length} contactos recibidos`);

  const clientContacts = allContacts.filter(looksLikeClient);
  console.log(`2) Contacts kept for import: ${clientContacts.length}`);

  const rawRows = clientContacts.map((row) => {
    const payload = JSON.stringify(row);
    return {
      holded_id: pickHoldedId(row),
      payload: row,
      source_endpoint: "/api/invoicing/v1/contacts",
      source_hash: sha256(payload),
      fetched_at: new Date().toISOString(),
    };
  });

  console.log("3) Upserting holded_contacts_raw...");
  {
    const { error } = await supabase
      .from("holded_contacts_raw")
      .upsert(rawRows, { onConflict: "holded_id" });

    if (error) throw new Error(`Supabase upsert holded_contacts_raw failed: ${error.message}`);
  }

  console.log("4) Rebuilding holded_contacts...");
  const projectedRows = clientContacts.map((row) => ({
    holded_id: pickHoldedId(row),
    name: asText(row.name),
    code: asText(row.code),
    email: asText(row.email),
    mobile: asText(row.mobile),
    phone: asText(row.phone),
    type: pickType(row),
    vat_number: asText(row.vatNumber ?? row.vat_number),
    tax_id: asText(row.taxId ?? row.tax_id),
    contact_person: asText(row.contactPerson ?? row.contact_person),
    company: asText(row.company),
    client_type: pickType(row),
    billing_address: asJson(row.billingAddress ?? row.billing_address),
    shipping_address: asJson(row.shippingAddress ?? row.shipping_address),
    tags: asJson(row.tags),
    raw_payload: row,
    fetched_at: new Date().toISOString(),
  }));

  {
    const { error } = await supabase
      .from("holded_contacts")
      .upsert(projectedRows, { onConflict: "holded_id" });

    if (error) throw new Error(`Supabase upsert holded_contacts failed: ${error.message}`);
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