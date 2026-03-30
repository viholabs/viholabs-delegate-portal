/* eslint-disable no-console */

import { createClient } from "@supabase/supabase-js";

type DbClientRow = {
  id: string;
  name: string | null;
  tax_id: string | null;
  holded_contact_id: string | null;
  delegate_id: string | null;
};

type HoldedContact = {
  id: string;
  name?: string | null;
  code?: string | null;
  customId?: string | null;
  vatnumber?: string | null;
  identification?: string | null;
};

const TARGET_CLIENT_ID = "e9dcb90a-599f-444a-986a-b7ffc1063f72"; // Pascual Martínez

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

function normalizeName(s: string): string {
  return normalizeSpaces(
    stripDiacritics(safeStr(s).toLowerCase())
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

function normalizeTaxId(s: string): string {
  const v = safeStr(s).toUpperCase().replace(/\s+/g, "");
  if (!v) return "";
  if (["00000000T", "000000000", "99999999R", "X0000000T"].includes(v)) return "";
  return v;
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

function findExistingCandidate(
  client: DbClientRow,
  contacts: HoldedContact[]
): HoldedContact | null {
  const byCurrentId = safeStr(client.holded_contact_id);
  if (byCurrentId) {
    const exact = contacts.find((c) => safeStr(c.id) === byCurrentId);
    if (exact) return exact;
  }

  const validTax = normalizeTaxId(client.tax_id || "");
  if (validTax) {
    const taxMatches = contacts.filter((c) => {
      const cTax = normalizeTaxId(
        safeStr(c.vatnumber) || safeStr(c.identification) || safeStr(c.customId)
      );
      return cTax === validTax;
    });
    if (taxMatches.length === 1) return taxMatches[0];
  }

  const clientName = normalizeName(client.name || "");
  if (clientName) {
    const nameMatches = contacts.filter(
      (c) => normalizeName(c.name || "") === clientName
    );
    if (nameMatches.length === 1) return nameMatches[0];
  }

  return null;
}

async function fetchClient(): Promise<DbClientRow> {
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

  const { data, error } = await supabase
    .from("clients")
    .select(`
      id,
      name,
      tax_id,
      holded_contact_id,
      delegate_id
    `)
    .eq("id", TARGET_CLIENT_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase client query failed: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Client not found: ${TARGET_CLIENT_ID}`);
  }

  return {
    id: safeStr((data as any).id),
    name: (data as any).name ?? null,
    tax_id: (data as any).tax_id ?? null,
    holded_contact_id: (data as any).holded_contact_id ?? null,
    delegate_id: (data as any).delegate_id ?? null,
  };
}

async function createHoldedContactWithoutTaxId(
  apiKey: string,
  client: DbClientRow
): Promise<HoldedContact> {
  const payload = {
    name: safeStr(client.name),
    code: safeStr(client.id),
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

  if (!supabaseUrl) throw new Error("SUPABASE URL missing");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from("clients")
    .update({ holded_contact_id: holdedContactId })
    .eq("id", clientId);

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`);
  }
}

async function main() {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");

  console.log("1) Leyendo cliente Pascual Martínez desde BD...");
  const client = await fetchClient();
  console.log({
    id: client.id,
    name: client.name,
    tax_id: client.tax_id,
    holded_contact_id: client.holded_contact_id,
  });

  console.log("2) Leyendo contactos de Holded...");
  const contacts = await fetchAllHoldedContacts(holdedApiKey);
  console.log(`   OK: ${contacts.length} contactos`);

  console.log("3) Buscando si ya existe en Holded...");
  const existing = findExistingCandidate(client, contacts);

  if (existing) {
    console.log("   Encontrado contacto existente. Enlazando...");
    await updateClientHoldedContactId(client.id, safeStr(existing.id));

    console.log("\nOK");
    console.log({
      action: "linked_existing_contact",
      client_id: client.id,
      client_name: client.name,
      holded_contact_id: safeStr(existing.id),
      holded_contact_name: safeStr(existing.name),
    });
    return;
  }

  console.log("4) No existe match fiable. Creando en Holded SIN NIF...");
  const created = await createHoldedContactWithoutTaxId(holdedApiKey, client);

  console.log("5) Actualizando clients.holded_contact_id...");
  await updateClientHoldedContactId(client.id, safeStr(created.id));

  console.log("\nOK");
  console.log({
    action: "created_in_holded_without_tax_id_and_linked",
    client_id: client.id,
    client_name: client.name,
    previous_tax_id: client.tax_id,
    holded_contact_id: safeStr(created.id),
    holded_contact_name: safeStr(created.name),
  });
}

main().catch((err) => {
  console.error("\nERROR");
  console.error(err);
  process.exit(1);
});