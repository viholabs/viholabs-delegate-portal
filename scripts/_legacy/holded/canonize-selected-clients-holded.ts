/* eslint-disable no-console */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import path from "node:path";

type DbClientRow = {
  id: string;
  name: string | null;
  tax_id: string | null;
  holded_contact_id: string | null;
  delegate_id: string | null;
  delegate_name: string | null;
};

type HoldedContact = {
  id: string;
  name?: string | null;
  code?: string | null;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  customId?: string | null;
  vatnumber?: string | null;
  identification?: string | null;
  billAddress?: {
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
};

type ActionType =
  | "already_linked_ok"
  | "linked_by_tax_id"
  | "linked_by_name"
  | "created_in_holded_and_linked"
  | "review_duplicate_candidates"
  | "review_invalid_tax_id"
  | "review_not_found";

type ReportRow = {
  client_id: string;
  client_name: string;
  delegate_name: string;
  delegate_id: string;
  client_tax_id: string;
  old_holded_contact_id: string;
  final_holded_contact_id: string;
  final_holded_name: string;
  action: ActionType;
  notes: string;
};

const TARGET_CLIENT_IDS = [
  "0e78040a-8442-4848-9cbe-5b63a0723c33", // Anna MONTSALUT SL
  "9f4ee41b-9698-49f1-9fbc-9073884436df", // Blanca Galofre
  "70ce2de8-c7b0-4573-98e4-2e8bc4dbe51a", // Cliente
  "6f3e214a-80c6-4857-ad0f-8d741756d1b8", // Dra Montserrat Florit Juste
  "669cd64a-9a58-457f-8c77-88592f2c25dd", // Dra Silvia Tutusaus
  "54e4da83-40dc-4a2c-887e-a7d0e90d2a68", // Dra Suni Peirè
  "2ab973bc-2452-467a-b88b-5e1805911318", // Gemma Morales
  "393648b4-a68a-40bb-a8c1-cd5f7bb88641", // Jose Anselmo Serrano
  "af795e9b-e3d4-42bc-9967-574af090e8a9", // Lidia Rodriguez Fdez
  "f925862e-337a-442f-845e-6442c64df21e", // Maria Trave
  "d8f1fa78-91f6-4cd5-a357-bb5149944521", // MCarme Pujadas Prims
  "52f65a99-98a2-4b2a-85d7-9bbe2437cfd5", // Melania Coronado Catellano
  "060a9be8-2878-4cf1-ba02-a16d0da8dcab", // Nuria Colome
  "e9dcb90a-599f-444a-986a-b7ffc1063f72", // Pascual Martínez
];

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

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTaxId(s: string): string {
  const v = safeStr(s).toUpperCase().replace(/\s+/g, "");
  if (!v) return "";
  if (["00000000T", "000000000", "99999999R", "X0000000T"].includes(v)) return "";
  return v;
}

function normalizeName(s: string): string {
  return normalizeSpaces(
    stripDiacritics(safeStr(s).toLowerCase())
      .replace(/\bdrs?\b/g, " ")
      .replace(/\bdra\b/g, " ")
      .replace(/\bdoctora\b/g, " ")
      .replace(/\bdoctor\b/g, " ")
      .replace(/\bsl\b/g, " ")
      .replace(/\bs l\b/g, " ")
      .replace(/\bs\.l\.\b/g, " ")
      .replace(/\bsa\b/g, " ")
      .replace(/\bs a\b/g, " ")
      .replace(/\bs\.a\.\b/g, " ")
      .replace(/\bclinic[ao]?\b/g, " ")
      .replace(/\bcentre\b/g, " ")
      .replace(/\bcentro\b/g, " ")
      .replace(/\s*\(.*?\)\s*$/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

function csvEscape(v: unknown): string {
  const s = safeStr(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function holdedFetchJson<T>(url: string, init: RequestInit, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      key: apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Holded HTTP ${res.status}: ${txt}`);
  }

  return (await res.json()) as T;
}

async function fetchAllHoldedContacts(apiKey: string): Promise<HoldedContact[]> {
  const base = "https://api.holded.com/api/invoicing/v1/contacts";
  const out: HoldedContact[] = [];
  let page = 1;

  while (true) {
    const rows = await holdedFetchJson<HoldedContact[]>(
      `${base}?page=${page}`,
      { method: "GET" },
      apiKey
    );

    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);

    if (rows.length < 50) break;
    page += 1;
  }

  return out;
}

async function createHoldedContact(
  apiKey: string,
  client: DbClientRow
): Promise<HoldedContact> {
  const payload = {
    name: safeStr(client.name),
    code: safeStr(client.id),
    customId: normalizeTaxId(client.tax_id || "") || undefined,
    vatnumber: normalizeTaxId(client.tax_id || "") || undefined,
  };

  return await holdedFetchJson<HoldedContact>(
    "https://api.holded.com/api/invoicing/v1/contacts",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    apiKey
  );
}

async function updateHoldedContactName(
  apiKey: string,
  contactId: string,
  canonicalName: string
): Promise<void> {
  await holdedFetchJson(
    `https://api.holded.com/api/invoicing/v1/contacts/${contactId}`,
    {
      method: "PUT",
      body: JSON.stringify({ name: canonicalName }),
    },
    apiKey
  );
}

async function fetchTargetClients(): Promise<DbClientRow[]> {
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
      delegate_id
    `)
    .in("id", TARGET_CLIENT_IDS)
    .order("name", { ascending: true });

  if (clientsError) {
    throw new Error(`Supabase clients query failed: ${clientsError.message}`);
  }

  const clients = Array.isArray(clientsData) ? clientsData : [];

  const delegateIds = Array.from(
    new Set(clients.map((r: any) => safeStr(r?.delegate_id)).filter(Boolean))
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

  return clients.map((r: any) => {
    const delegateId = safeStr(r?.delegate_id);
    return {
      id: safeStr(r?.id),
      name: r?.name ?? null,
      tax_id: r?.tax_id ?? null,
      holded_contact_id: r?.holded_contact_id ?? null,
      delegate_id: delegateId || null,
      delegate_name: delegateId ? delegateNameById.get(delegateId) ?? null : null,
    };
  });
}

async function updateClientHoldedContactId(
  clientId: string,
  holdedContactId: string
): Promise<void> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from("clients")
    .update({ holded_contact_id: holdedContactId })
    .eq("id", clientId);

  if (error) {
    throw new Error(`Supabase update failed for client ${clientId}: ${error.message}`);
  }
}

function buildIndexes(contacts: HoldedContact[]) {
  const byId = new Map<string, HoldedContact>();
  const byTaxId = new Map<string, HoldedContact[]>();
  const byName = new Map<string, HoldedContact[]>();

  for (const c of contacts) {
    const id = safeStr(c.id);
    if (id) byId.set(id, c);

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

  return { byId, byTaxId, byName };
}

function resolveCandidate(
  client: DbClientRow,
  idx: ReturnType<typeof buildIndexes>
): {
  type: "existing_id" | "tax_id" | "name" | "duplicate_name_candidates" | "none" | "invalid_tax";
  contact: HoldedContact | null;
  candidates?: HoldedContact[];
} {
  const currentId = safeStr(client.holded_contact_id);
  if (currentId) {
    const exact = idx.byId.get(currentId) || null;
    if (exact) return { type: "existing_id", contact: exact };
  }

  const tax = normalizeTaxId(client.tax_id || "");
  if (!tax && normalizeTaxId(client.tax_id || "") === "") {
    const byName = idx.byName.get(normalizeName(client.name || "")) || [];
    if (byName.length > 1) {
      return { type: "duplicate_name_candidates", contact: null, candidates: byName };
    }
    if (byName.length === 1) {
      return { type: "name", contact: byName[0] };
    }
    if (safeStr(client.tax_id) && !tax) {
      return { type: "invalid_tax", contact: null };
    }
  }

  if (tax) {
    const taxMatches = idx.byTaxId.get(tax) || [];
    if (taxMatches.length === 1) {
      return { type: "tax_id", contact: taxMatches[0] };
    }
  }

  const nameMatches = idx.byName.get(normalizeName(client.name || "")) || [];
  if (nameMatches.length === 1) {
    return { type: "name", contact: nameMatches[0] };
  }
  if (nameMatches.length > 1) {
    return {
      type: "duplicate_name_candidates",
      contact: null,
      candidates: nameMatches,
    };
  }

  return { type: "none", contact: null };
}

async function main() {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");

  console.log("1) Leyendo clientes objetivo desde BD...");
  const clients = await fetchTargetClients();
  console.log(`   OK: ${clients.length} clientes objetivo`);

  console.log("2) Leyendo contactos de Holded...");
  const holdedContacts = await fetchAllHoldedContacts(holdedApiKey);
  console.log(`   OK: ${holdedContacts.length} contactos`);

  const idx = buildIndexes(holdedContacts);

  const report: ReportRow[] = [];
  const duplicateCandidates: Array<{
    client_id: string;
    client_name: string;
    candidates: HoldedContact[];
  }> = [];

  console.log("3) Canonizando...");

  for (const client of clients) {
    const resolution = resolveCandidate(client, idx);

    if (resolution.type === "existing_id" && resolution.contact) {
      report.push({
        client_id: client.id,
        client_name: safeStr(client.name),
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: safeStr(client.tax_id),
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: safeStr(resolution.contact.id),
        final_holded_name: safeStr(resolution.contact.name),
        action: "already_linked_ok",
        notes: "Ya enlazado y existente en Holded",
      });
      continue;
    }

    if (resolution.type === "tax_id" && resolution.contact) {
      await updateClientHoldedContactId(client.id, safeStr(resolution.contact.id));

      report.push({
        client_id: client.id,
        client_name: safeStr(client.name),
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: safeStr(client.tax_id),
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: safeStr(resolution.contact.id),
        final_holded_name: safeStr(resolution.contact.name),
        action: "linked_by_tax_id",
        notes: "Enlazado por tax_id",
      });
      continue;
    }

    if (resolution.type === "name" && resolution.contact) {
      await updateClientHoldedContactId(client.id, safeStr(resolution.contact.id));

      const holdedName = safeStr(resolution.contact.name);
      const portalName = safeStr(client.name);

      if (portalName && holdedName && normalizeName(portalName) === normalizeName(holdedName) && portalName !== holdedName) {
        await updateHoldedContactName(holdedApiKey, safeStr(resolution.contact.id), portalName);
      }

      report.push({
        client_id: client.id,
        client_name: portalName,
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: safeStr(client.tax_id),
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: safeStr(resolution.contact.id),
        final_holded_name: portalName || holdedName,
        action: "linked_by_name",
        notes: "Enlazado por nombre normalizado; si había variante menor, nombre de Holded actualizado al canónico del portal",
      });
      continue;
    }

    if (resolution.type === "duplicate_name_candidates") {
      duplicateCandidates.push({
        client_id: client.id,
        client_name: safeStr(client.name),
        candidates: resolution.candidates || [],
      });

      report.push({
        client_id: client.id,
        client_name: safeStr(client.name),
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: safeStr(client.tax_id),
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: "",
        final_holded_name: "",
        action: "review_duplicate_candidates",
        notes: "Hay varios posibles contactos en Holded; no se hace merge ciego",
      });
      continue;
    }

    if (resolution.type === "invalid_tax") {
      report.push({
        client_id: client.id,
        client_name: safeStr(client.name),
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: safeStr(client.tax_id),
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: "",
        final_holded_name: "",
        action: "review_invalid_tax_id",
        notes: "Tax ID placeholder o inválido; no se usa para canonización automática",
      });
      continue;
    }

    const created = await createHoldedContact(holdedApiKey, client);
    await updateClientHoldedContactId(client.id, safeStr(created.id));

    report.push({
      client_id: client.id,
      client_name: safeStr(client.name),
      delegate_name: safeStr(client.delegate_name),
      delegate_id: safeStr(client.delegate_id),
      client_tax_id: safeStr(client.tax_id),
      old_holded_contact_id: safeStr(client.holded_contact_id),
      final_holded_contact_id: safeStr(created.id),
      final_holded_name: safeStr(created.name),
      action: "created_in_holded_and_linked",
      notes: "Creado en Holded y enlazado en clients.holded_contact_id",
    });
  }

  const outDir = process.cwd();
  const reportJsonPath = path.join(outDir, "tmp_canonize_report.json");
  const reportCsvPath = path.join(outDir, "tmp_canonize_report.csv");
  const dupJsonPath = path.join(outDir, "tmp_holded_duplicate_candidates.json");

  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(dupJsonPath, JSON.stringify(duplicateCandidates, null, 2), "utf8");

  const header = [
    "client_id",
    "client_name",
    "delegate_name",
    "delegate_id",
    "client_tax_id",
    "old_holded_contact_id",
    "final_holded_contact_id",
    "final_holded_name",
    "action",
    "notes",
  ];

  const csv = [
    header.join(","),
    ...report.map((r) =>
      header.map((k) => csvEscape((r as any)[k])).join(",")
    ),
  ].join("\n");

  writeFileSync(reportCsvPath, csv, "utf8");

  const stats = report.reduce<Record<string, number>>((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});

  console.log("\nResumen:");
  console.table(stats);

  console.log(`\nREPORT JSON: ${reportJsonPath}`);
  console.log(`REPORT CSV : ${reportCsvPath}`);
  console.log(`DUP JSON   : ${dupJsonPath}`);
}

main().catch((err) => {
  console.error("\nERROR");
  console.error(err);
  process.exit(1);
});