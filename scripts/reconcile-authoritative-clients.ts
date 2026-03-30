/* eslint-disable no-console */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import path from "node:path";

type AuthoritativeClient = {
  code: string;
  name: string;
  tax_id: string;
  email: string;
  phone: string;
  mobile: string;
  city: string;
};

type PortalClient = {
  id: string;
  name: string | null;
  tax_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  holded_contact_id: string | null;
  status: string | null;
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

type ReconcileRow = {
  code: string;
  authoritative_name: string;
  authoritative_tax_id: string;
  authoritative_email: string;
  authoritative_phone: string;
  authoritative_mobile: string;
  authoritative_city: string;

  portal_match_status: string;
  portal_client_id: string;
  portal_name: string;
  portal_tax_id: string;
  portal_email: string;
  portal_phone: string;
  portal_holded_contact_id: string;
  portal_status: string;
  portal_delegate_name: string;

  holded_match_status: string;
  holded_contact_id: string;
  holded_name: string;
  holded_tax_id: string;
  holded_email: string;
  holded_phone: string;
  holded_mobile: string;
  holded_city: string;

  consistency_status: string;
  notes: string;
};

const AUTHORITATIVE_CLIENTS: AuthoritativeClient[] = [
  {
    code: "AF",
    name: "Amparo Ferrer Báguena",
    tax_id: "",
    email: "amparoferrerbaguena@gmail.com",
    phone: "655890729",
    mobile: "655890729",
    city: "Valencia",
  },
  {
    code: "AB",
    name: "Ana Belén García Álvarez",
    tax_id: "71521465K",
    email: "anabelen.garciaalvarez@hotmail.com",
    phone: "",
    mobile: "600968143",
    city: "Villablino",
  },
  {
    code: "AM",
    name: "ANA MARIA AMORES VIDAL",
    tax_id: "33888679L",
    email: "",
    phone: "",
    mobile: "669241724",
    city: "Granollers",
  },
  {
    code: "AD",
    name: "Aurora Delgado",
    tax_id: "",
    email: "auroradelgado@hotmail.com",
    phone: "+34680951993",
    mobile: "+34680951993",
    city: "Barcelona",
  },
  {
    code: "CP",
    name: "Carme Pujadas Prims",
    tax_id: "52152387W",
    email: "carmepujser@gmail.com",
    phone: "+34625177047",
    mobile: "+34625177047",
    city: "Corró d'Avall",
  },
  {
    code: "CR",
    name: "Carmen Riera casas",
    tax_id: "00000000T",
    email: "carmen3-@hotmail.es",
    phone: "+34699826116",
    mobile: "+34699826116",
    city: "Barriada nova Canovelles",
  },
  {
    code: "CS",
    name: "Cecilia Sandoval Arana",
    tax_id: "46333693D",
    email: "ceciliasand@hotmail.com",
    phone: "",
    mobile: "637800834",
    city: "Alella",
  },
  {
    code: "CG",
    name: "Constancia Guallar Latorre",
    tax_id: "",
    email: "cos.guallar@gmail.com",
    phone: "645860135",
    mobile: "645860135",
    city: "Barcelona",
  },
  {
    code: "EM",
    name: "Encarnacion Martín Ruiz",
    tax_id: "46705395P",
    email: "vibraconenka@gmail.com",
    phone: "",
    mobile: "647 800 295",
    city: "Bellavista",
  },
  {
    code: "EA",
    name: "Erica Arroyo Mata",
    tax_id: "",
    email: "ericaarroyom@outlook.com",
    phone: "670231284",
    mobile: "670231284",
    city: "Cornellà de Llobregat",
  },
  {
    code: "EM",
    name: "ESTETIC MEDICEL SL",
    tax_id: "B09775487",
    email: "clients@medicel.es",
    phone: "",
    mobile: "669269121",
    city: "Barcelona",
  },
  {
    code: "EP",
    name: "Esther Pich Dura",
    tax_id: "35037714C",
    email: "herbodieteticaarrels@gmail.com",
    phone: "609761799",
    mobile: "609761799",
    city: "El Masnou",
  },
  {
    code: "GB",
    name: "Gisele Butelman",
    tax_id: "00000000T",
    email: "",
    phone: "",
    mobile: "670 28 41 45",
    city: "Barcelona",
  },
  {
    code: "HE",
    name: "Herbolari El Refugi De Les Herbes - Cristina ArumÍ Ortiz",
    tax_id: "35105982R",
    email: "bcn@elrefuguidelesherbes.com",
    phone: "931862898",
    mobile: "640366398",
    city: "Barcelona",
  },
  {
    code: "HN",
    name: "Herbolario Naturmel - Melania Coronado Castellano",
    tax_id: "47180614R",
    email: "",
    phone: "931580755",
    mobile: "605944218",
    city: "Terrassa",
  },
  {
    code: "H",
    name: "HOMEDICAL - BLANCA GALOFRÉ MUNNÉ",
    tax_id: "46226775H",
    email: "info@homedical.es",
    phone: "",
    mobile: "",
    city: "Barcelona",
  },
  {
    code: "IR",
    name: "Imma Requena Vilalta",
    tax_id: "",
    email: "",
    phone: "657857035",
    mobile: "657857035",
    city: "Canovelles",
  },
  {
    code: "ID",
    name: "Isabel de las Heras - Isabel de las Heras",
    tax_id: "52198569T",
    email: "isabeldelasheras13@gmail.com",
    phone: "",
    mobile: "607289682",
    city: "Cubelles",
  },
  {
    code: "IF",
    name: "Ivette Fernández Tornero",
    tax_id: "47971402A",
    email: "ivette.dietintegrativa@gmail.com",
    phone: "",
    mobile: "",
    city: "Santa Maria de Palautordera",
  },
  {
    code: "JG",
    name: "Janicette Garcia Lopez",
    tax_id: "",
    email: "dulcemariantonieta@gmail.com",
    phone: "618333479",
    mobile: "618333479",
    city: "TOLEDO",
  },
  {
    code: "JA",
    name: "José Anselmo Serrano López",
    tax_id: "52421138K",
    email: "",
    phone: "",
    mobile: "657376015",
    city: "Vilafranca del Penedès",
  },
  {
    code: "JA",
    name: "Josefina Alsina Falgas",
    tax_id: "77901921R",
    email: "f.alsina@hotmail.com",
    phone: "685461820",
    mobile: "685461820",
    city: "Cassà de la Selva",
  },
  {
    code: "LR",
    name: "Lidia Rodríguez Fernández",
    tax_id: "33920291Y",
    email: "lidiarodriguezfernandez59@gmail.com",
    phone: "",
    mobile: "670667276",
    city: "Parets del Vallès",
  },
  {
    code: "LT",
    name: "Lidia Teixidor Marce",
    tax_id: "77920487Y",
    email: "cos9@cos9.com",
    phone: "",
    mobile: "662437939",
    city: "Banyoles",
  },
  {
    code: "LF",
    name: "Lorena Fernandez Fernández",
    tax_id: "",
    email: "lorenamonchi@gmail.com",
    phone: "606735939",
    mobile: "606735939",
    city: "Luarca",
  },
  {
    code: "MK",
    name: "Manjeet Kalra (New Master food company SL)",
    tax_id: "",
    email: "mikekalra@gmail.com",
    phone: "+34629845702",
    mobile: "+34629845702",
    city: "Barcelona",
  },
  {
    code: "MS",
    name: "Margarita Sanz Garcia",
    tax_id: "37277431C",
    email: "margasanz59@gmail.com",
    phone: "648713672",
    mobile: "648713672",
    city: "Sant Vicenç de Montalt",
  },
  {
    code: "MD",
    name: "María del Carmen Corrochano Hernando",
    tax_id: "00000000T",
    email: "luismollero@gmail.com",
    phone: "635604805",
    mobile: "635604805",
    city: "Toledo",
  },
  {
    code: "MD",
    name: "Maria dolores Bustos Marin",
    tax_id: "",
    email: "loli.buma4@gmail.com",
    phone: "",
    mobile: "",
    city: "Hospitalet De llobregat",
  },
  {
    code: "MT",
    name: "María Trave Martínez",
    tax_id: "40946580W",
    email: "mariatravemm@gmail.com",
    phone: "",
    mobile: "666976897",
    city: "El Masnou",
  },
  {
    code: "ML",
    name: "Marta Lima Parra",
    tax_id: "",
    email: "emedemarta@gmail.com",
    phone: "647919229",
    mobile: "647919229",
    city: "Barcelona",
  },
  {
    code: "MG",
    name: "Mireia Gabarro Rodenas",
    tax_id: "47796445F",
    email: "",
    phone: "",
    mobile: "666795278",
    city: "Santa Coloma de Gramenet",
  },
  {
    code: "MF",
    name: "Mònica Falla Pérez",
    tax_id: "40446149M",
    email: "",
    phone: "",
    mobile: "677884878",
    city: "Gerona",
  },
  {
    code: "MR",
    name: "Mónica Ramírez Guirao",
    tax_id: "45541724E",
    email: "herboristeria.lasalut@gmail.com",
    phone: "872025802",
    mobile: "",
    city: "Blanes",
  },
  {
    code: "MS",
    name: "Monsalut S.L.",
    tax_id: "B61414777",
    email: "conta@wearenorth.biz",
    phone: "933510044",
    mobile: "",
    city: "Barcelona",
  },
  {
    code: "NC",
    name: "Nuria Colomer Prat",
    tax_id: "38804714B",
    email: "ncp.colomer@gmail.com",
    phone: "937538641",
    mobile: "606762249",
    city: "Vilassar de Dalt",
  },
  {
    code: "PM",
    name: "patrícia miralles",
    tax_id: "",
    email: "sileta17@gmail.com",
    phone: "609 77 32 09",
    mobile: "609 77 32 09",
    city: "guixers",
  },
  {
    code: "RB",
    name: "Richard Beguiristain Sastre",
    tax_id: "",
    email: "rbeguiristain@hotmail.com",
    phone: "609646430",
    mobile: "609646430",
    city: "Barcelona",
  },
  {
    code: "RI",
    name: "rosalia iglesias",
    tax_id: "",
    email: "rosaliaiglesias@gmail.com",
    phone: "",
    mobile: "",
    city: "madrid",
  },
  {
    code: "SF",
    name: "Silvina Flavia Sánchez",
    tax_id: "X6553115R",
    email: "silvina@turinconnatural.es",
    phone: "",
    mobile: "634490677",
    city: "Barcelona",
  },
  {
    code: "TL",
    name: "Teresa Luisa Palmeiro Pereiro",
    tax_id: "",
    email: "tlpalmeiro@gmail.com",
    phone: "659832031",
    mobile: "659832031",
    city: "Madrid",
  },
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
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function stripDiacritics(s: string): string {
  return normalizeSpaces(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\bherbolari\b/g, " ")
    .replace(/\bherbolario\b/g, " ")
    .replace(/\bhomedical\b/g, " ")
    .replace(/\bcristina arumi ortiz\b/g, " cristina arumi ortiz ")
    .replace(/\bmelania coronado castellano\b/g, " melania coronado castellano ")
    .replace(/\bblanca galofre munne\b/g, " blanca galofre munne ")
    .replace(/\bisabel de las heras\b/g, " isabel de las heras ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(s: string): string {
  return safeStr(s).toLowerCase();
}

function normalizePhone(s: string): string {
  return safeStr(s).replace(/[^\d+]/g, "");
}

function normalizeTaxId(s: string): string {
  const v = safeStr(s).toUpperCase().replace(/\s+/g, "");
  return v;
}

function isValidTaxIdForStrictMatch(s: string): boolean {
  const v = normalizeTaxId(s);
  if (!v) return false;
  if (["00000000T", "000000000", "99999999R", "X0000000T"].includes(v)) return false;
  return true;
}

function csvEscape(v: unknown): string {
  const s = safeStr(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function getSupabase() {
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

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchPortalClients(): Promise<PortalClient[]> {
  const supabase = getSupabase();

  const { data: clientsData, error: clientsError } = await supabase
    .from("clients")
    .select(`
      id,
      name,
      tax_id,
      contact_email,
      contact_phone,
      holded_contact_id,
      status,
      delegate_id
    `)
    .order("name", { ascending: true });

  if (clientsError) {
    throw new Error(`Supabase clients query failed: ${clientsError.message}`);
  }

  const allClients = Array.isArray(clientsData) ? clientsData : [];

  const filteredClients = allClients.filter(
    (r: any) => safeStr(r?.status).toUpperCase() !== "MERGED_DUPLICATE"
  );

  const delegateIds = Array.from(
    new Set(
      filteredClients
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

  return filteredClients.map((r: any) => ({
    id: safeStr(r?.id),
    name: r?.name ?? null,
    tax_id: r?.tax_id ?? null,
    contact_email: r?.contact_email ?? null,
    contact_phone: r?.contact_phone ?? null,
    holded_contact_id: r?.holded_contact_id ?? null,
    status: r?.status ?? null,
    delegate_id: r?.delegate_id ?? null,
    delegate_name: delegateNameById.get(safeStr(r?.delegate_id)) ?? null,
  }));
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

function chooseUnique<T>(rows: T[]): T | null {
  return rows.length === 1 ? rows[0] : null;
}

function matchPortalClient(auth: AuthoritativeClient, portalClients: PortalClient[]) {
  const validTax = isValidTaxIdForStrictMatch(auth.tax_id);
  const tax = normalizeTaxId(auth.tax_id);
  const email = normalizeEmail(auth.email);
  const phone = normalizePhone(auth.phone || auth.mobile);
  const name = normalizeName(auth.name);

  if (validTax) {
    const matches = portalClients.filter(
      (p) => normalizeTaxId(p.tax_id || "") === tax
    );
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_tax_id", row: one };
  }

  if (email) {
    const matches = portalClients.filter(
      (p) => normalizeEmail(p.contact_email || "") === email
    );
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_email", row: one };
  }

  if (phone) {
    const matches = portalClients.filter(
      (p) => normalizePhone(p.contact_phone || "") === phone
    );
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_phone", row: one };
  }

  if (name) {
    const matches = portalClients.filter(
      (p) => normalizeName(p.name || "") === name
    );
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_name", row: one };
    if (matches.length > 1) return { status: "multiple_matches_by_name", row: null };
  }

  return { status: "not_found_in_portal", row: null };
}

function matchHoldedContact(auth: AuthoritativeClient, holdedContacts: HoldedContact[]) {
  const validTax = isValidTaxIdForStrictMatch(auth.tax_id);
  const tax = normalizeTaxId(auth.tax_id);
  const email = normalizeEmail(auth.email);
  const phone = normalizePhone(auth.phone || auth.mobile);
  const name = normalizeName(auth.name);

  const usable = holdedContacts.filter(
    (h) => safeStr(h.type).toLowerCase() !== "supplier"
  );

  if (validTax) {
    const matches = usable.filter((h) => {
      const hTax = normalizeTaxId(
        safeStr(h.vatnumber) ||
          safeStr(h.identification) ||
          safeStr(h.customId) ||
          safeStr(h.code)
      );
      return hTax === tax;
    });
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_tax_id", row: one };
  }

  if (email) {
    const matches = usable.filter(
      (h) => normalizeEmail(h.email || "") === email
    );
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_email", row: one };
  }

  if (phone) {
    const matches = usable.filter(
      (h) =>
        normalizePhone(h.phone || "") === phone ||
        normalizePhone(h.mobile || "") === phone
    );
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_phone", row: one };
  }

  if (name) {
    const matches = usable.filter((h) => {
      const byName = normalizeName(h.name || "");
      const byTrade = normalizeName(h.tradeName || "");
      return byName === name || byTrade === name;
    });
    const one = chooseUnique(matches);
    if (one) return { status: "matched_by_name", row: one };
    if (matches.length > 1) return { status: "multiple_matches_by_name", row: null };
  }

  return { status: "not_found_in_holded", row: null };
}

function buildConsistencyStatus(
  portalStatus: string,
  holdedStatus: string,
  portal: PortalClient | null,
  holded: HoldedContact | null
): { consistency_status: string; notes: string } {
  if (portal && holded) {
    const portalHoldedId = safeStr(portal.holded_contact_id);
    const holdedId = safeStr(holded.id);

    if (portalHoldedId && portalHoldedId === holdedId) {
      return {
        consistency_status: "OK_PORTAL_AND_HOLDED_LINKED",
        notes: "Está en portal y en Holded, y el enlace holded_contact_id es correcto",
      };
    }

    if (!portalHoldedId) {
      return {
        consistency_status: "PORTAL_AND_HOLDED_BUT_NOT_LINKED",
        notes: "Existe en portal y en Holded, pero falta enlazar holded_contact_id",
      };
    }

    return {
      consistency_status: "PORTAL_AND_HOLDED_LINK_MISMATCH",
      notes: "Existe en ambos, pero el holded_contact_id del portal apunta a otro contacto",
    };
  }

  if (portal && !holded) {
    return {
      consistency_status: "ONLY_IN_PORTAL",
      notes: "Está en portal pero no aparece en Holded",
    };
  }

  if (!portal && holded) {
    return {
      consistency_status: "ONLY_IN_HOLDED",
      notes: "Está en Holded pero no aparece en portal",
    };
  }

  return {
    consistency_status: "MISSING_BOTH",
    notes: "No aparece ni en portal ni en Holded",
  };
}

async function main() {
  const holdedApiKey = requireEnv("HOLDED_API_KEY");

  console.log("1) Leyendo clientes del portal...");
  const portalClients = await fetchPortalClients();
  console.log(`   OK: ${portalClients.length} clientes portal activos`);

  console.log("2) Leyendo contactos de Holded...");
  const holdedContacts = await fetchAllHoldedContacts(holdedApiKey);
  console.log(`   OK: ${holdedContacts.length} contactos Holded`);

  console.log("3) Reconciliando lista canónica...");
  const rows: ReconcileRow[] = AUTHORITATIVE_CLIENTS.map((auth) => {
    const portalMatch = matchPortalClient(auth, portalClients);
    const holdedMatch = matchHoldedContact(auth, holdedContacts);

    const portal = portalMatch.row;
    const holded = holdedMatch.row;

    const consistency = buildConsistencyStatus(
      portalMatch.status,
      holdedMatch.status,
      portal,
      holded
    );

    const holdedTax = normalizeTaxId(
      safeStr(holded?.vatnumber) ||
        safeStr(holded?.identification) ||
        safeStr(holded?.customId) ||
        safeStr(holded?.code)
    );

    return {
      code: auth.code,
      authoritative_name: auth.name,
      authoritative_tax_id: auth.tax_id,
      authoritative_email: auth.email,
      authoritative_phone: auth.phone,
      authoritative_mobile: auth.mobile,
      authoritative_city: auth.city,

      portal_match_status: portalMatch.status,
      portal_client_id: safeStr(portal?.id),
      portal_name: safeStr(portal?.name),
      portal_tax_id: safeStr(portal?.tax_id),
      portal_email: safeStr(portal?.contact_email),
      portal_phone: safeStr(portal?.contact_phone),
      portal_holded_contact_id: safeStr(portal?.holded_contact_id),
      portal_status: safeStr(portal?.status),
      portal_delegate_name: safeStr(portal?.delegate_name),

      holded_match_status: holdedMatch.status,
      holded_contact_id: safeStr(holded?.id),
      holded_name: safeStr(holded?.name),
      holded_tax_id: holdedTax,
      holded_email: safeStr(holded?.email),
      holded_phone: safeStr(holded?.phone),
      holded_mobile: safeStr(holded?.mobile),
      holded_city: safeStr(holded?.billAddress?.city),

      consistency_status: consistency.consistency_status,
      notes: consistency.notes,
    };
  });

  const summary = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.consistency_status] = (acc[row.consistency_status] || 0) + 1;
    return acc;
  }, {});

  console.log("\nResumen reconciliación:");
  console.table(summary);

  const outDir = process.cwd();
  const jsonPath = path.join(outDir, "tmp_authoritative_clients_reconcile.json");
  const csvPath = path.join(outDir, "tmp_authoritative_clients_reconcile.csv");

  writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

  const header = [
    "code",
    "authoritative_name",
    "authoritative_tax_id",
    "authoritative_email",
    "authoritative_phone",
    "authoritative_mobile",
    "authoritative_city",
    "portal_match_status",
    "portal_client_id",
    "portal_name",
    "portal_tax_id",
    "portal_email",
    "portal_phone",
    "portal_holded_contact_id",
    "portal_status",
    "portal_delegate_name",
    "holded_match_status",
    "holded_contact_id",
    "holded_name",
    "holded_tax_id",
    "holded_email",
    "holded_phone",
    "holded_mobile",
    "holded_city",
    "consistency_status",
    "notes",
  ];

  const csv = [
    header.join(","),
    ...rows.map((r) => header.map((k) => csvEscape((r as any)[k])).join(",")),
  ].join("\n");

  writeFileSync(csvPath, csv, "utf8");

  console.log(`\nJSON: ${jsonPath}`);
  console.log(`CSV : ${csvPath}`);
}

main().catch((err) => {
  console.error("\nERROR");
  console.error(err);
  process.exit(1);
});