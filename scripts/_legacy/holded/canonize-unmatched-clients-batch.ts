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
  tradeName?: string | null;
  type?: string | null;
  clientRecord?: unknown;
  supplierRecord?: unknown;
  billAddress?: {
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
};

type CandidateReason =
  | "by_holded_contact_id"
  | "by_tax_id"
  | "by_exact_name"
  | "by_canonical_name"
  | "by_token_subset"
  | "by_trade_name";

type ActionType =
  | "already_linked_ok"
  | "linked_existing_unique_candidate"
  | "created_in_holded_and_linked"
  | "skipped_invalid_placeholder"
  | "review_multiple_candidates"
  | "review_no_match"
  | "review_holded_contact_collision";

type Candidate = {
  contact: HoldedContact;
  score: number;
  reason: CandidateReason;
};

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
  reason: string;
  score: string;
  notes: string;
};

type UpdateClientHoldedContactIdResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: "collision";
      existing_client_id: string;
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

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTaxId(s: string): string {
  const v = safeStr(s).toUpperCase().replace(/\s+/g, "");
  if (!v) return "";
  if (["00000000T", "000000000", "99999999R", "X0000000T"].includes(v)) return "";
  return v;
}

function isPlaceholderTaxId(s: string): boolean {
  const v = safeStr(s).toUpperCase().replace(/\s+/g, "");
  return ["00000000T", "000000000", "99999999R", "X0000000T"].includes(v);
}

function isGarbageClientName(s: string): boolean {
  const v = normalizeSpaces(stripDiacritics(safeStr(s).toLowerCase()));
  return v === "" || v === "cliente" || v === "clientes" || v === "client";
}

function normalizeNameBasic(s: string): string {
  return normalizeSpaces(
    stripDiacritics(safeStr(s).toLowerCase()).replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

function canonicalName(s: string): string {
  return normalizeSpaces(
    normalizeNameBasic(s)
      .replace(/\bdr\b/g, " ")
      .replace(/\bdra\b/g, " ")
      .replace(/\bdoctor\b/g, " ")
      .replace(/\bdoctora\b/g, " ")
      .replace(/\bmr\b/g, " ")
      .replace(/\bmrs\b/g, " ")
      .replace(/\bms\b/g, " ")
      .replace(/\bsl\b/g, " ")
      .replace(/\bs l\b/g, " ")
      .replace(/\bslu\b/g, " ")
      .replace(/\bs a\b/g, " ")
      .replace(/\bsa\b/g, " ")
      .replace(/\bscp\b/g, " ")
      .replace(/\bs c p\b/g, " ")
      .replace(/\bclinic\b/g, " ")
      .replace(/\bclinica\b/g, " ")
      .replace(/\bcentre\b/g, " ")
      .replace(/\bcentro\b/g, " ")
      .replace(/\bherbolario\b/g, " ")
      .replace(/\bherboristeria\b/g, " ")
      .replace(/\bhomedical\b/g, " ")
      .replace(/\benka\b/g, " ")
      .replace(/\bfdez\b/g, " fernandez ")
      .replace(/\brodriguez fdez\b/g, " rodriguez fernandez ")
      .replace(/\bcolome\b/g, " colomer ")
      .replace(/\bmcarme\b/g, " carme ")
      .replace(/\bcatellano\b/g, " castellano ")
      .replace(/\bmonsalut\b/g, " montsalut ")
      .replace(/\s+/g, " ")
  );
}

function tokenSet(s: string): string[] {
  const stop = new Set(["de", "del", "la", "las", "los", "el", "i", "y", "en", "the"]);

  const tokens = canonicalName(s)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !stop.has(x))
    .filter((x) => x.length >= 2);

  return Array.from(new Set(tokens));
}

function isSubset(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const bSet = new Set(b);
  return a.every((t) => bSet.has(t));
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let inter = 0;

  for (const t of aSet) {
    if (bSet.has(t)) inter += 1;
  }

  const denom = Math.max(aSet.size, bSet.size);
  return denom === 0 ? 0 : inter / denom;
}

function csvEscape(v: unknown): string {
  const s = safeStr(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function holdedFetchJson<T>(
  url: string,
  init: RequestInit,
  apiKey: string
): Promise<T> {
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
  const taxId = normalizeTaxId(client.tax_id || "");

  const payload = {
    name: safeStr(client.name),
    code: safeStr(client.id),
    customId: taxId || undefined,
    vatnumber: taxId || undefined,
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

async function fetchDbClientsWithoutMatch(): Promise<DbClientRow[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

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
    .or("holded_contact_id.is.null,holded_contact_id.eq.")
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
): Promise<UpdateClientHoldedContactIdResult> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

  if (!supabaseUrl) throw new Error("SUPABASE URL missing");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existingRows, error: existingError } = await supabase
    .from("clients")
    .select("id, holded_contact_id")
    .eq("holded_contact_id", holdedContactId);

  if (existingError) {
    throw new Error(
      `Supabase collision check failed for holded_contact_id ${holdedContactId}: ${existingError.message}`
    );
  }

  const existing = Array.isArray(existingRows)
    ? existingRows.find((r: any) => safeStr(r?.id) !== clientId)
    : null;

  if (existing) {
    return {
      ok: false,
      reason: "collision",
      existing_client_id: safeStr((existing as any).id),
    };
  }

  const { error } = await supabase
    .from("clients")
    .update({ holded_contact_id: holdedContactId })
    .eq("id", clientId);

  if (error) {
    throw new Error(`Supabase update failed for client ${clientId}: ${error.message}`);
  }

  return { ok: true };
}

function isHoldedUsableClientContact(c: HoldedContact): boolean {
  const type = safeStr(c.type).toLowerCase();

  if (type === "supplier") return false;

  const hasClientRecord =
    c.clientRecord != null && c.clientRecord !== 0 && c.clientRecord !== "0";

  if (type === "client" || hasClientRecord) return true;

  return true;
}

function buildCandidateList(client: DbClientRow, contacts: HoldedContact[]): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const clientHoldedId = safeStr(client.holded_contact_id);
  const clientTax = normalizeTaxId(client.tax_id || "");
  const clientNameRaw = safeStr(client.name);
  const clientNameBasic = normalizeNameBasic(clientNameRaw);
  const clientNameCanonical = canonicalName(clientNameRaw);
  const clientTokens = tokenSet(clientNameRaw);

  for (const contact of contacts) {
    if (!isHoldedUsableClientContact(contact)) continue;

    const contactId = safeStr(contact.id);
    if (!contactId) continue;

    const contactTax = normalizeTaxId(
      safeStr(contact.vatnumber) ||
        safeStr(contact.identification) ||
        safeStr(contact.customId) ||
        safeStr(contact.code)
    );

    const contactName = safeStr(contact.name);
    const contactTradeName = safeStr(contact.tradeName);
    const contactBasic = normalizeNameBasic(contactName);
    const contactCanonical = canonicalName(contactName);
    const contactTradeCanonical = canonicalName(contactTradeName);
    const contactTokens = tokenSet(contactName);
    const contactTradeTokens = tokenSet(contactTradeName);

    let score = 0;
    let reason: CandidateReason | null = null;

    if (clientHoldedId && clientHoldedId === contactId) {
      score = 1000;
      reason = "by_holded_contact_id";
    } else if (clientTax && contactTax && clientTax === contactTax) {
      score = 950;
      reason = "by_tax_id";
    } else if (clientNameBasic && clientNameBasic === contactBasic) {
      score = 900;
      reason = "by_exact_name";
    } else if (clientNameCanonical && clientNameCanonical === contactCanonical) {
      score = 850;
      reason = "by_canonical_name";
    } else if (
      clientNameCanonical &&
      contactTradeCanonical &&
      clientNameCanonical === contactTradeCanonical
    ) {
      score = 820;
      reason = "by_trade_name";
    } else {
      const mainOverlap = overlapRatio(clientTokens, contactTokens);
      const tradeOverlap = overlapRatio(clientTokens, contactTradeTokens);

      const subsetMain =
        isSubset(clientTokens, contactTokens) || isSubset(contactTokens, clientTokens);

      const subsetTrade =
        isSubset(clientTokens, contactTradeTokens) ||
        isSubset(contactTradeTokens, clientTokens);

      if (subsetMain && mainOverlap >= 0.66) {
        score = 780;
        reason = "by_token_subset";
      } else if (subsetTrade && tradeOverlap >= 0.66) {
        score = 760;
        reason = "by_trade_name";
      } else if (mainOverlap >= 0.75) {
        score = 740;
        reason = "by_token_subset";
      } else if (tradeOverlap >= 0.75) {
        score = 720;
        reason = "by_trade_name";
      }
    }

    if (reason && !seen.has(contactId)) {
      candidates.push({
        contact,
        score,
        reason,
      });
      seen.add(contactId);
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score || safeStr(a.contact.name).localeCompare(safeStr(b.contact.name))
  );

  return candidates;
}

function isUniqueWinner(candidates: Candidate[]): boolean {
  if (candidates.length === 0) return false;
  if (candidates.length === 1) return true;
  return candidates[0].score >= 850 && candidates[0].score - candidates[1].score >= 80;
}

async function main() {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");

  console.log("1) Leyendo clientes sin holded_contact_id...");
  const clients = await fetchDbClientsWithoutMatch();
  console.log(`   OK: ${clients.length} clientes`);

  console.log("2) Leyendo contactos de Holded...");
  const holdedContacts = await fetchAllHoldedContacts(holdedApiKey);
  console.log(`   OK: ${holdedContacts.length} contactos Holded`);

  const report: ReportRow[] = [];
  const multipleCandidates: Array<{
    client_id: string;
    client_name: string;
    delegate_name: string;
    client_tax_id: string;
    candidates: Array<{
      id: string;
      name: string;
      trade_name: string;
      tax_id: string;
      score: number;
      reason: CandidateReason;
    }>;
  }> = [];

  console.log("3) Canonizando lote...");

  for (const client of clients) {
    const name = safeStr(client.name);
    const rawTax = safeStr(client.tax_id);
    const invalidPlaceholder =
      isGarbageClientName(name) || (rawTax !== "" && isPlaceholderTaxId(rawTax));

    if (invalidPlaceholder && name !== "Pascual Martínez") {
      report.push({
        client_id: client.id,
        client_name: name,
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: rawTax,
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: "",
        final_holded_name: "",
        action: "skipped_invalid_placeholder",
        reason: "",
        score: "",
        notes: "Registro placeholder o identidad débil; no crear automáticamente",
      });
      continue;
    }

    const candidates = buildCandidateList(client, holdedContacts);

    if (candidates.length > 0 && isUniqueWinner(candidates)) {
      const winner = candidates[0];
      const updateResult = await updateClientHoldedContactId(
        client.id,
        safeStr(winner.contact.id)
      );

      if (!updateResult.ok && updateResult.reason === "collision") {
        report.push({
          client_id: client.id,
          client_name: name,
          delegate_name: safeStr(client.delegate_name),
          delegate_id: safeStr(client.delegate_id),
          client_tax_id: rawTax,
          old_holded_contact_id: safeStr(client.holded_contact_id),
          final_holded_contact_id: safeStr(winner.contact.id),
          final_holded_name: safeStr(winner.contact.name),
          action: "review_holded_contact_collision",
          reason: winner.reason,
          score: String(winner.score),
          notes: `El holded_contact_id ya pertenece a otro client.id=${updateResult.existing_client_id}. Revisar merge/canonización.`,
        });
        continue;
      }

      report.push({
        client_id: client.id,
        client_name: name,
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: rawTax,
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: safeStr(winner.contact.id),
        final_holded_name: safeStr(winner.contact.name),
        action:
          winner.reason === "by_holded_contact_id"
            ? "already_linked_ok"
            : "linked_existing_unique_candidate",
        reason: winner.reason,
        score: String(winner.score),
        notes: "Enlazado automáticamente por candidato único",
      });
      continue;
    }

    if (candidates.length > 1) {
      multipleCandidates.push({
        client_id: client.id,
        client_name: name,
        delegate_name: safeStr(client.delegate_name),
        client_tax_id: rawTax,
        candidates: candidates.slice(0, 5).map((c) => ({
          id: safeStr(c.contact.id),
          name: safeStr(c.contact.name),
          trade_name: safeStr(c.contact.tradeName),
          tax_id: normalizeTaxId(
            safeStr(c.contact.vatnumber) ||
              safeStr(c.contact.identification) ||
              safeStr(c.contact.customId) ||
              safeStr(c.contact.code)
          ),
          score: c.score,
          reason: c.reason,
        })),
      });

      report.push({
        client_id: client.id,
        client_name: name,
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: rawTax,
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: "",
        final_holded_name: "",
        action: "review_multiple_candidates",
        reason: candidates[0].reason,
        score: String(candidates[0].score),
        notes: "Varios candidatos; no crear para evitar duplicados",
      });
      continue;
    }

    if (name === "") {
      report.push({
        client_id: client.id,
        client_name: name,
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: rawTax,
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: "",
        final_holded_name: "",
        action: "review_no_match",
        reason: "",
        score: "",
        notes: "Sin nombre usable; revisión manual",
      });
      continue;
    }

    const created = await createHoldedContact(holdedApiKey, client);
    const updateResult = await updateClientHoldedContactId(client.id, safeStr(created.id));
    holdedContacts.push(created);

    if (!updateResult.ok && updateResult.reason === "collision") {
      report.push({
        client_id: client.id,
        client_name: name,
        delegate_name: safeStr(client.delegate_name),
        delegate_id: safeStr(client.delegate_id),
        client_tax_id: rawTax,
        old_holded_contact_id: safeStr(client.holded_contact_id),
        final_holded_contact_id: safeStr(created.id),
        final_holded_name: safeStr(created.name),
        action: "review_holded_contact_collision",
        reason: "",
        score: "",
        notes: `Se creó contacto en Holded pero el id ya colisiona con client.id=${updateResult.existing_client_id}. Revisar manualmente.`,
      });
      continue;
    }

    report.push({
      client_id: client.id,
      client_name: name,
      delegate_name: safeStr(client.delegate_name),
      delegate_id: safeStr(client.delegate_id),
      client_tax_id: rawTax,
      old_holded_contact_id: safeStr(client.holded_contact_id),
      final_holded_contact_id: safeStr(created.id),
      final_holded_name: safeStr(created.name),
      action: "created_in_holded_and_linked",
      reason: "",
      score: "",
      notes: "No había candidato fiable; creado en Holded y enlazado",
    });
  }

  const outDir = process.cwd();
  const reportJsonPath = path.join(outDir, "tmp_canonize_batch_report.json");
  const reportCsvPath = path.join(outDir, "tmp_canonize_batch_report.csv");
  const multiJsonPath = path.join(outDir, "tmp_canonize_multiple_candidates.json");

  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(multiJsonPath, JSON.stringify(multipleCandidates, null, 2), "utf8");

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
    "reason",
    "score",
    "notes",
  ];

  const csv = [
    header.join(","),
    ...report.map((r) => header.map((k) => csvEscape((r as any)[k])).join(",")),
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
  console.log(`MULTI JSON : ${multiJsonPath}`);
}

main().catch((err) => {
  console.error("\nERROR");
  console.error(err);
  process.exit(1);
});