/* eslint-disable no-console */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import path from "node:path";

type DbClientRow = {
  id: string;
  name: string | null;
  tax_id: string | null;
  email: string | null;
  holded_contact_id: string | null;
  delegate_id: string | null;
  delegate_name: string | null;
  status: string | null;
};

type HoldedContact = {
  id: string;
  name?: string | null;
  code?: string | null;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  billAddress?: {
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
  customId?: string | null;
  vatnumber?: string | null;
  identification?: string | null;
};

type MatchType =
  | "by_holded_contact_id"
  | "by_email"
  | "by_tax_id"
  | "by_name"
  | "no_match";

type OutputRow = {
  client_id: string;
  client_name: string;
  delegate_name: string;
  delegate_id: string;
  client_tax_id: string;
  client_email: string;
  client_status: string;
  portal_holded_contact_id: string;
  matched_holded_contact_id: string;
  matched_holded_name: string;
  matched_holded_email: string;
  matched_holded_tax_id: string;
  match_type: MatchType;
};

function requireEnv(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`${name} missing`);
  return v;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeName(s: string): string {
  return normalizeSpaces(
    safeStr(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*\(.*?\)\s*$/g, "")
      .replace(/\s*-\s*enka\s*$/g, "")
      .replace(/\s*-\s*homedical\s*$/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

function normalizeEmail(s: string): string {
  return safeStr(s).toLowerCase();
}

function normalizeTaxId(s: string): string {
  const v = safeStr(s).toUpperCase().replace(/\s+/g, "");
  if (!v) return "";
  if (["00000000T", "000000000", "99999999R", "X0000000T"].includes(v)) return "";
  return v;
}

function csvEscape(v: unknown): string {
  const s = safeStr(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function fetchAllHoldedContacts(apiKey: string): Promise<HoldedContact[]> {
  const base = "https://api.holded.com/api/invoicing/v1/contacts";
  const out: HoldedContact[] = [];
  let page = 1;

  while (true) {
    const url = `${base}?page=${page}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        key: apiKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Holded contacts HTTP ${res.status}: ${txt}`);
    }

    const json = (await res.json()) as unknown;
    const rows = Array.isArray(json) ? (json as HoldedContact[]) : [];

    if (rows.length === 0) break;

    out.push(...rows);

    if (rows.length < 50) break;
    page += 1;
  }

  return out;
}

async function fetchDbClients(): Promise<DbClientRow[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";

  if (!supabaseUrl) throw new Error("SUPABASE URL missing");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: clientsData, error: clientsError } = await supabase
    .from("clients")
    .select(`
      id,
      name,
      tax_id,
      holded_contact_id,
      delegate_id,
      status
    `)
    .order("name", { ascending: true });

  if (clientsError) {
    throw new Error(`Supabase clients query failed: ${clientsError.message}`);
  }

  const allClients = Array.isArray(clientsData) ? clientsData : [];

  const mergedDuplicates = allClients.filter(
    (r: any) => safeStr(r?.status).toUpperCase() === "MERGED_DUPLICATE"
  );

  const activeClients = allClients.filter(
    (r: any) => safeStr(r?.status).toUpperCase() !== "MERGED_DUPLICATE"
  );

  console.log(`   DEBUG total clients read      : ${allClients.length}`);
  console.log(`   DEBUG merged_duplicate found : ${mergedDuplicates.length}`);
  console.log(`   DEBUG active clients kept    : ${activeClients.length}`);

  const mergedDebugPath = path.join(process.cwd(), "tmp_merged_duplicate_clients.json");
  writeFileSync(
    mergedDebugPath,
    JSON.stringify(
      mergedDuplicates.map((r: any) => ({
        id: safeStr(r?.id),
        name: safeStr(r?.name),
        status: safeStr(r?.status),
        holded_contact_id: safeStr(r?.holded_contact_id),
      })),
      null,
      2
    ),
    "utf8"
  );

  const delegateIds = Array.from(
    new Set(
      activeClients
        .map((r: any) => safeStr(r?.delegate_id))
        .filter(Boolean)
    )
  );

  const delegateNameById = new Map<string, string>();

  if (delegateIds.length > 0) {
    const { data: actorsData, error: actorsError } = await supabase
      .from("actors")
      .select("id, name")
      .in("id", delegateIds);

    if (actorsError) {
      throw new Error(`Supabase actors query failed: ${actorsError.message}`);
    }

    for (const a of Array.isArray(actorsData) ? actorsData : []) {
      const id = safeStr((a as any)?.id);
      const name = safeStr((a as any)?.name);
      if (id) delegateNameById.set(id, name);
    }
  }

  return activeClients.map((r: any) => {
    const delegateId = safeStr(r?.delegate_id);

    return {
      id: safeStr(r?.id),
      name: r?.name ?? null,
      tax_id: r?.tax_id ?? null,
      email: null,
      holded_contact_id: r?.holded_contact_id ?? null,
      delegate_id: delegateId || null,
      delegate_name: delegateId ? delegateNameById.get(delegateId) ?? null : null,
      status: r?.status ?? null,
    };
  });
}

function buildIndexes(contacts: HoldedContact[]) {
  const byId = new Map<string, HoldedContact>();
  const byEmail = new Map<string, HoldedContact[]>();
  const byTaxId = new Map<string, HoldedContact[]>();
  const byName = new Map<string, HoldedContact[]>();

  for (const c of contacts) {
    const id = safeStr(c.id);
    if (id) byId.set(id, c);

    const email = normalizeEmail(c.email || "");
    if (email) {
      const arr = byEmail.get(email) || [];
      arr.push(c);
      byEmail.set(email, arr);
    }

    const tax = normalizeTaxId(
      safeStr(c.vatnumber) || safeStr(c.identification) || safeStr(c.customId)
    );
    if (tax) {
      const arr = byTaxId.get(tax) || [];
      arr.push(c);
      byTaxId.set(tax, arr);
    }

    const name = normalizeName(c.name || "");
    if (name) {
      const arr = byName.get(name) || [];
      arr.push(c);
      byName.set(name, arr);
    }
  }

  return { byId, byEmail, byTaxId, byName };
}

function chooseSingle(rows: HoldedContact[] | undefined): HoldedContact | null {
  if (!rows || rows.length !== 1) return null;
  return rows[0];
}

function matchOne(
  client: DbClientRow,
  idx: ReturnType<typeof buildIndexes>
): { matchType: MatchType; contact: HoldedContact | null } {
  const portalHoldedId = safeStr(client.holded_contact_id);
  if (portalHoldedId) {
    const exact = idx.byId.get(portalHoldedId) || null;
    if (exact) return { matchType: "by_holded_contact_id", contact: exact };
  }

  const email = normalizeEmail(client.email || "");
  if (email) {
    const exact = chooseSingle(idx.byEmail.get(email));
    if (exact) return { matchType: "by_email", contact: exact };
  }

  const tax = normalizeTaxId(client.tax_id || "");
  if (tax) {
    const exact = chooseSingle(idx.byTaxId.get(tax));
    if (exact) return { matchType: "by_tax_id", contact: exact };
  }

  const name = normalizeName(client.name || "");
  if (name) {
    const exact = chooseSingle(idx.byName.get(name));
    if (exact) return { matchType: "by_name", contact: exact };
  }

  return { matchType: "no_match", contact: null };
}

async function main() {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");

  console.log("1) Leyendo clientes de BD...");
  const dbClients = await fetchDbClients();
  console.log(`   OK: ${dbClients.length} clientes`);

  console.log("2) Leyendo contactos de Holded...");
  const holdedContacts = await fetchAllHoldedContacts(holdedApiKey);
  console.log(`   OK: ${holdedContacts.length} contactos Holded`);

  console.log("3) Construyendo índices...");
  const idx = buildIndexes(holdedContacts);

  console.log("4) Haciendo matching...");
  const output: OutputRow[] = dbClients.map((c) => {
    const m = matchOne(c, idx);
    const hc = m.contact;

    return {
      client_id: c.id,
      client_name: safeStr(c.name),
      delegate_name: safeStr(c.delegate_name),
      delegate_id: safeStr(c.delegate_id),
      client_tax_id: safeStr(c.tax_id),
      client_email: safeStr(c.email),
      client_status: safeStr(c.status),
      portal_holded_contact_id: safeStr(c.holded_contact_id),
      matched_holded_contact_id: safeStr(hc?.id),
      matched_holded_name: safeStr(hc?.name),
      matched_holded_email: safeStr(hc?.email),
      matched_holded_tax_id: normalizeTaxId(
        safeStr(hc?.vatnumber) || safeStr(hc?.identification) || safeStr(hc?.customId)
      ),
      match_type: m.matchType,
    };
  });

  const outDir = process.cwd();
  const jsonPath = path.join(outDir, "tmp_clients_holded_match.json");
  const csvPath = path.join(outDir, "tmp_clients_holded_match.csv");

  writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");

  const header = [
    "client_id",
    "client_name",
    "delegate_name",
    "delegate_id",
    "client_tax_id",
    "client_email",
    "client_status",
    "portal_holded_contact_id",
    "matched_holded_contact_id",
    "matched_holded_name",
    "matched_holded_email",
    "matched_holded_tax_id",
    "match_type",
  ];

  const csv = [
    header.join(","),
    ...output.map((r) =>
      [
        r.client_id,
        r.client_name,
        r.delegate_name,
        r.delegate_id,
        r.client_tax_id,
        r.client_email,
        r.client_status,
        r.portal_holded_contact_id,
        r.matched_holded_contact_id,
        r.matched_holded_name,
        r.matched_holded_email,
        r.matched_holded_tax_id,
        r.match_type,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");

  writeFileSync(csvPath, csv, "utf8");

  const stats = output.reduce<Record<string, number>>((acc, r) => {
    acc[r.match_type] = (acc[r.match_type] || 0) + 1;
    return acc;
  }, {});

  console.log("\nResumen:");
  console.table(stats);

  console.log(`\nJSON: ${jsonPath}`);
  console.log(`CSV : ${csvPath}`);
  console.log(`MERGED DEBUG JSON: ${path.join(process.cwd(), "tmp_merged_duplicate_clients.json")}`);
}

main().catch((err) => {
  console.error("\nERROR");
  console.error(err);
  process.exit(1);
});