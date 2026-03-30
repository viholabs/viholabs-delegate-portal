/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { holdedFetch } from "../src/lib/holded/holdedFetch";
import { fetchChangedIds } from "../src/lib/holded/holdedIncremental";

const envLocalPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

type SupabaseLike = {
  from: (table: string) => any;
};

type HoldedDocType = "invoice" | "creditnote";

type HoldedDocRef = {
  id: string;
  docType: HoldedDocType;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value.trim();
}

function requireSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function normalizeYmd(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  if (!value) return fallback;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return parsed.toISOString().slice(0, 10);
}

function toNullableString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function dedupeDocRefs(items: HoldedDocRef[]): HoldedDocRef[] {
  const seen = new Set<string>();
  const out: HoldedDocRef[] = [];

  for (const item of items) {
    const key = `${item.docType}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

async function fetchAllChangedDocRefsByType(args: {
  docType: HoldedDocType;
  since: string;
  until: string;
  pageSize: number;
}): Promise<HoldedDocRef[]> {
  const { docType, since, until, pageSize } = args;

  const collected: HoldedDocRef[] = [];
  let page = 1;

  while (true) {
    const ids = await fetchChangedIds({
      docType,
      since,
      until,
      page,
      pageSize,
    });

    if (!Array.isArray(ids) || ids.length === 0) break;

    for (const id of ids) {
      const cleanId = toNullableString(id);
      if (!cleanId) continue;

      collected.push({ id: cleanId, docType });
    }

    if (ids.length < pageSize) break;
    page += 1;
  }

  return collected;
}

async function fetchHoldedDocumentDetailById(
  docType: HoldedDocType,
  externalId: string
): Promise<any> {
  const detail = await holdedFetch(docType, externalId);

  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    throw new Error(`Invalid Holded detail for ${docType}/${externalId}`);
  }

  return detail;
}

async function ensureHoldedContact(
  supabase: SupabaseLike,
  holdedContactId: string,
  rawDetail: any
): Promise<void> {
  const existing = await supabase
    .from("holded_contacts")
    .select("holded_id")
    .eq("holded_id", holdedContactId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (!existing.data) {
    await supabase.from("holded_contacts").insert({
      holded_id: holdedContactId,
      raw_payload: rawDetail,
      name: toNullableString(rawDetail?.contactName),
    });
  }
}

/**
 * 🔥 FUNCIÓN CLAVE NUEVA
 */
async function ensureClientForHoldedContact(
  supabase: SupabaseLike,
  holdedContactId: string,
  rawDetail: any
): Promise<string> {
  const existing = await supabase
    .from("clients")
    .select("id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data?.id) {
    return existing.data.id;
  }

  const name =
    toNullableString(rawDetail?.contactName) ||
    toNullableString(rawDetail?.name) ||
    "UNKNOWN";

  const inserted = await supabase
    .from("clients")
    .insert({
      holded_contact_id: holdedContactId,
      name,
      name_raw: name,
      legal_name: name,
      profile_type: "client",
      status: "active",
      state_code: "OPEN",
    })
    .select("id")
    .single();

  if (inserted.error) throw inserted.error;

  console.log(`   client auto-created :: ${holdedContactId}`);

  return inserted.data.id;
}

async function ensureMapping(
  supabase: SupabaseLike,
  holdedContactId: string,
  clientId: string
): Promise<"exists" | "inserted"> {
  const existing = await supabase
    .from("holded_contact_client_map_g1")
    .select("client_id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data?.client_id) {
    return "exists";
  }

  const insert = await supabase
    .from("holded_contact_client_map_g1")
    .insert({
      holded_contact_id: holdedContactId,
      client_id: clientId,
    });

  if (insert.error) throw insert.error;

  return "inserted";
}

async function main(): Promise<void> {
  const supabaseUrl = requireSupabaseUrl();
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as SupabaseLike;

  const since = normalizeYmd(process.env.SINCE, getDateNDaysAgo(30));
  const until = normalizeYmd(
    process.env.UNTIL,
    new Date().toISOString().slice(0, 10)
  );

  console.log("PRE-FLIGHT START");
  console.log(`since: ${since}`);
  console.log(`until: ${until}`);

  const invoiceRefs = await fetchAllChangedDocRefsByType({
    docType: "invoice",
    since,
    until,
    pageSize: 100,
  });

  const creditRefs = await fetchAllChangedDocRefsByType({
    docType: "creditnote",
    since,
    until,
    pageSize: 100,
  });

  const refs = dedupeDocRefs([...invoiceRefs, ...creditRefs]);

  const contacts = new Map<string, any>();

  for (const ref of refs) {
    const detail = await fetchHoldedDocumentDetailById(
      ref.docType,
      ref.id
    );

    const contactId = toNullableString(detail.contact);
    if (!contactId) continue;

    if (!contacts.has(contactId)) {
      contacts.set(contactId, detail);
    }
  }

  for (const [contactId, rawDetail] of contacts.entries()) {
    try {
      await ensureHoldedContact(supabase, contactId, rawDetail);

      const clientId = await ensureClientForHoldedContact(
        supabase,
        contactId,
        rawDetail
      );

      const mapping = await ensureMapping(
        supabase,
        contactId,
        clientId
      );

      console.log(
        `   OK :: ${contactId} :: mapping=${mapping}`
      );
    } catch (e) {
      console.error(
        `   ERROR :: ${contactId} :: ${normalizeError(e)}`
      );
    }
  }

  console.log("DONE");
}

main().catch((e) => {
  console.error("FATAL:", normalizeError(e));
  process.exit(1);
});