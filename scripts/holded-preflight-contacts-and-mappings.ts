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
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const e = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [
      toNullableString(e.message),
      toNullableString(e.details),
      toNullableString(e.hint),
      toNullableString(e.code),
    ].filter((x): x is string => Boolean(x));

    if (parts.length > 0) {
      return parts.join(" | ");
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
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

    if (!Array.isArray(ids) || ids.length === 0) {
      break;
    }

    for (const id of ids) {
      const cleanId = toNullableString(id);
      if (!cleanId) continue;

      collected.push({
        id: cleanId,
        docType,
      });
    }

    if (ids.length < pageSize) {
      break;
    }

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
): Promise<"exists" | "inserted"> {
  const existing = await supabase
    .from("holded_contacts")
    .select("holded_id")
    .eq("holded_id", holdedContactId)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return "exists";
  }

  const insertPayload: Record<string, unknown> = {
    holded_id: holdedContactId,
    raw_payload: rawDetail,
  };

  const contactName = toNullableString(rawDetail?.contactName);
  if (contactName) {
    insertPayload.name = contactName;
  }

  const insertResult = await supabase
    .from("holded_contacts")
    .insert(insertPayload);

  if (insertResult.error) {
    throw insertResult.error;
  }

  const verify = await supabase
    .from("holded_contacts")
    .select("holded_id")
    .eq("holded_id", holdedContactId)
    .maybeSingle();

  if (verify.error) {
    throw verify.error;
  }

  if (!verify.data) {
    throw new Error(`Contact not persisted: ${holdedContactId}`);
  }

  return "inserted";
}

async function ensureMapping(
  supabase: SupabaseLike,
  holdedContactId: string
): Promise<"exists" | "inserted" | "skipped_no_client" | "skipped_multiple_clients"> {
  const existingMap = await supabase
    .from("holded_contact_client_map_g1")
    .select("client_id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (existingMap.error) {
    throw existingMap.error;
  }

  const existingClientId = toNullableString(existingMap.data?.client_id);
  if (existingClientId) {
    return "exists";
  }

  const clientsResult = await supabase
    .from("clients")
    .select("id")
    .eq("holded_contact_id", holdedContactId)
    .limit(2);

  if (clientsResult.error) {
    throw clientsResult.error;
  }

  const rows = Array.isArray(clientsResult.data) ? clientsResult.data : [];

  if (rows.length === 0) {
    return "skipped_no_client";
  }

  if (rows.length > 1) {
    return "skipped_multiple_clients";
  }

  const clientId = toNullableString(rows[0]?.id);
  if (!clientId) {
    return "skipped_no_client";
  }

  const insertResult = await supabase
    .from("holded_contact_client_map_g1")
    .insert({
      holded_contact_id: holdedContactId,
      client_id: clientId,
    });

  if (insertResult.error) {
    throw insertResult.error;
  }

  const verify = await supabase
    .from("holded_contact_client_map_g1")
    .select("holded_contact_id, client_id")
    .eq("holded_contact_id", holdedContactId)
    .maybeSingle();

  if (verify.error) {
    throw verify.error;
  }

  const verifiedClientId = toNullableString(verify.data?.client_id);
  if (!verify.data || !verifiedClientId) {
    throw new Error(`Mapping not persisted: ${holdedContactId}`);
  }

  return "inserted";
}

async function main(): Promise<void> {
  const supabaseUrl = requireSupabaseUrl();
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    throw new Error("Missing env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as SupabaseLike;

  const lookbackDays = parsePositiveInt(process.env.LOOKBACK_DAYS, 30);
  const since = normalizeYmd(process.env.SINCE, getDateNDaysAgo(lookbackDays));
  const until = normalizeYmd(
    process.env.UNTIL,
    new Date().toISOString().slice(0, 10)
  );
  const pageSize = parsePositiveInt(process.env.PAGE_SIZE, 100);

  console.log("1) Preflight window");
  console.log(`   since                : ${since}`);
  console.log(`   until                : ${until}`);
  console.log(`   page size            : ${pageSize}`);
  console.log("");

  console.log("2) Buscando IDs cambiados en Holded...");
  const invoiceRefs = await fetchAllChangedDocRefsByType({
    docType: "invoice",
    since,
    until,
    pageSize,
  });

  const creditNoteRefs = await fetchAllChangedDocRefsByType({
    docType: "creditnote",
    since,
    until,
    pageSize,
  });

  const changedRefs = dedupeDocRefs([...invoiceRefs, ...creditNoteRefs]);

  console.log(`   invoices changed     : ${invoiceRefs.length}`);
  console.log(`   creditnotes changed  : ${creditNoteRefs.length}`);
  console.log(`   total changed refs   : ${changedRefs.length}`);
  console.log("");

  const uniqueContacts = new Map<string, any>();
  const fetchErrors: Array<{
    externalId: string;
    docType: HoldedDocType;
    reason: string;
  }> = [];

  console.log("3) Descargando details y detectando detail.contact...");
  for (const ref of changedRefs) {
    try {
      const detail = await fetchHoldedDocumentDetailById(ref.docType, ref.id);
      const holdedContactId = toNullableString(detail.contact);

      console.log(
        `   detail ok :: ${ref.id} :: ${ref.docType} :: contact=${holdedContactId ?? "NO_CONTACT"}`
      );

      if (!holdedContactId) {
        continue;
      }

      if (!uniqueContacts.has(holdedContactId)) {
        uniqueContacts.set(holdedContactId, detail);
      }
    } catch (error: unknown) {
      const message = normalizeError(error);
      fetchErrors.push({
        externalId: ref.id,
        docType: ref.docType,
        reason: message,
      });
      console.warn(`   detail error :: ${ref.id} :: ${ref.docType} :: ${message}`);
    }
  }

  console.log("");
  console.log("4) Contactos únicos detectados...");
  console.log(`   unique contacts      : ${uniqueContacts.size}`);
  console.log(`   detail errors        : ${fetchErrors.length}`);
  console.log("");

  let contactsInserted = 0;
  let contactsAlreadyExisted = 0;
  let mappingsInserted = 0;
  let mappingsAlreadyExisted = 0;
  let mappingsSkippedNoClient = 0;
  let mappingsSkippedMultipleClients = 0;

  const unresolved: Array<{
    holdedContactId: string;
    reason: string;
  }> = [];

  for (const [holdedContactId, rawDetail] of uniqueContacts.entries()) {
    try {
      const contactResult = await ensureHoldedContact(
        supabase,
        holdedContactId,
        rawDetail
      );

      if (contactResult === "inserted") {
        contactsInserted += 1;
        console.log(`   contact inserted :: ${holdedContactId}`);
      } else {
        contactsAlreadyExisted += 1;
        console.log(`   contact exists   :: ${holdedContactId}`);
      }

      const mappingResult = await ensureMapping(supabase, holdedContactId);

      if (mappingResult === "inserted") {
        mappingsInserted += 1;
        console.log(`   mapping inserted :: ${holdedContactId}`);
      } else if (mappingResult === "exists") {
        mappingsAlreadyExisted += 1;
        console.log(`   mapping exists   :: ${holdedContactId}`);
      } else if (mappingResult === "skipped_no_client") {
        mappingsSkippedNoClient += 1;
        unresolved.push({
          holdedContactId,
          reason: "no_client_with_same_holded_contact_id",
        });
        console.log(
          `   mapping skipped  :: ${holdedContactId} :: no_client_with_same_holded_contact_id`
        );
      } else if (mappingResult === "skipped_multiple_clients") {
        mappingsSkippedMultipleClients += 1;
        unresolved.push({
          holdedContactId,
          reason: "multiple_clients_with_same_holded_contact_id",
        });
        console.log(
          `   mapping skipped  :: ${holdedContactId} :: multiple_clients_with_same_holded_contact_id`
        );
      }
    } catch (error: unknown) {
      const message = normalizeError(error);
      unresolved.push({
        holdedContactId,
        reason: message,
      });
      console.warn(`   preflight error  :: ${holdedContactId} :: ${message}`);
    }
  }

  console.log("");
  console.log("5) RESULT");
  console.log(
    JSON.stringify(
      {
        ok: true,
        since,
        until,
        changedInvoices: invoiceRefs.length,
        changedCreditNotes: creditNoteRefs.length,
        changedTotal: changedRefs.length,
        uniqueContacts: uniqueContacts.size,
        detailErrors: fetchErrors.length,
        contactsInserted,
        contactsAlreadyExisted,
        mappingsInserted,
        mappingsAlreadyExisted,
        mappingsSkippedNoClient,
        mappingsSkippedMultipleClients,
        unresolvedCount: unresolved.length,
        unresolved,
        fetchErrors,
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error("");
  console.error("[HOLDED_PREFLIGHT_CONTACTS_AND_MAPPINGS][ERROR]");
  console.error(normalizeError(error));
  process.exit(1);
});