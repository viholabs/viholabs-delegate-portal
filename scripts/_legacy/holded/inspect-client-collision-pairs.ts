/* eslint-disable no-console */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import path from "node:path";

type CollisionPair = {
  duplicate_client_id: string;
  canonical_client_id: string;
  duplicate_name: string;
  canonical_hint: string;
};

const COLLISION_PAIRS: CollisionPair[] = [
  {
    duplicate_client_id: "f8e46f44-906f-45a9-a6ac-306f6e805add",
    canonical_client_id: "51661407-9f1b-450c-aff4-7a0dd6ca4595",
    duplicate_name: "BLANCA GALOFRE MUNNE",
    canonical_hint: "BLANCA GALOFRÉ MUNNÉ",
  },
  {
    duplicate_client_id: "8deeed7c-8236-435b-bc68-848230750a45",
    canonical_client_id: "070edcff-ecd1-4516-96cd-2b72abb93299",
    duplicate_name: "Encarnacion Martin Ruiz",
    canonical_hint: "Encarnacion Martín Ruiz",
  },
  {
    duplicate_client_id: "ae9c7cd1-9918-452b-b7d5-d6e77a5006ed",
    canonical_client_id: "cb130d88-7ca6-4084-b892-bdd44eae8970",
    duplicate_name: "Ivette Fernández Tornero",
    canonical_hint: "Ivette Fernández Tornero",
  },
  {
    duplicate_client_id: "c69b3ea0-4889-44f9-8205-7fad303c823f",
    canonical_client_id: "85c9287e-2ba9-4336-a5b9-70c8f217b2f7",
    duplicate_name: "Monica Falla Pérez",
    canonical_hint: "Mònica Falla Pérez",
  },
  {
    duplicate_client_id: "08ffcd0e-54ee-4e35-9b16-8cac2d0f3188",
    canonical_client_id: "609be93a-3f39-4289-8e6d-a010163af9af",
    duplicate_name: "Monica Ramirez Guirao",
    canonical_hint: "Mónica Ramírez Guirao",
  },
  {
    duplicate_client_id: "3efabc7c-f3f4-43f5-a974-7c4360afea4c",
    canonical_client_id: "dd0effca-6a28-464c-9a54-98fc393a33dd",
    duplicate_name: "Silvina Flavia Sanchez",
    canonical_hint: "Silvina Flavia Sánchez",
  },
];

type ClientRow = {
  id: string;
  name: string | null;
  tax_id: string | null;
  holded_contact_id: string | null;
  delegate_id: string | null;
};

type RefTarget = {
  table: string;
  column: string;
};

type RefCount = {
  table: string;
  column: string;
  duplicate_count: number;
  canonical_count: number;
};

type PairReport = {
  duplicate_client_id: string;
  canonical_client_id: string;
  duplicate_client: ClientRow | null;
  canonical_client: ClientRow | null;
  refs: RefCount[];
};

const REFERENCE_TARGETS: RefTarget[] = [
  { table: "orders", column: "client_id" },
  { table: "draft_orders", column: "client_id" },
  { table: "invoices", column: "client_id" },
  { table: "invoice_affiliate_assignments", column: "client_id" },
  { table: "client_merge_audit", column: "source_client_id" },
  { table: "client_merge_audit", column: "target_client_id" },
  { table: "client_aliases", column: "client_id" },
  { table: "client_addresses", column: "client_id" },
  { table: "client_contacts", column: "client_id" },
  { table: "client_notes", column: "client_id" },
  { table: "client_tags", column: "client_id" },
  { table: "client_assignments", column: "client_id" },
  { table: "actor_client_assignments", column: "client_id" },
  { table: "delegate_clients", column: "client_id" },
  { table: "commissions", column: "client_id" },
  { table: "commission_lines", column: "client_id" },
  { table: "commission_draft_lines", column: "client_id" },
  { table: "settlement_lines", column: "client_id" },
  { table: "shipments", column: "client_id" },
  { table: "credit_notes", column: "client_id" },
];

function requireEnv(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`${name} missing`);
  return v;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
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

async function fetchClientsByIds(ids: string[]): Promise<Map<string, ClientRow>> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, tax_id, holded_contact_id, delegate_id")
    .in("id", ids);

  if (error) {
    throw new Error(`Supabase clients query failed: ${error.message}`);
  }

  const out = new Map<string, ClientRow>();

  for (const row of Array.isArray(data) ? data : []) {
    out.set(safeStr((row as any).id), {
      id: safeStr((row as any).id),
      name: (row as any).name ?? null,
      tax_id: (row as any).tax_id ?? null,
      holded_contact_id: (row as any).holded_contact_id ?? null,
      delegate_id: (row as any).delegate_id ?? null,
    });
  }

  return out;
}

async function countRefs(
  table: string,
  column: string,
  clientId: string
): Promise<number | null> {
  const supabase = getSupabase();

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, clientId);

  if (error) {
    console.log(`WARN ${table}.${column}: ${error.message}`);
    return null;
  }

  return Number(count || 0);
}

async function main() {
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const allIds = Array.from(
    new Set(
      COLLISION_PAIRS.flatMap((p) => [p.duplicate_client_id, p.canonical_client_id])
    )
  );

  console.log("1) Leyendo clientes implicados...");
  const clientsMap = await fetchClientsByIds(allIds);
  console.log(`   OK: ${clientsMap.size} clientes leídos`);

  console.log("2) Revisando referencias conocidas a clients.id...");
  console.log(`   Targets configurados: ${REFERENCE_TARGETS.length}`);

  console.log("3) Contando referencias por par...");
  const report: PairReport[] = [];

  for (const pair of COLLISION_PAIRS) {
    const duplicateClient = clientsMap.get(pair.duplicate_client_id) || null;
    const canonicalClient = clientsMap.get(pair.canonical_client_id) || null;

    const refCounts: RefCount[] = [];

    for (const ref of REFERENCE_TARGETS) {
      const duplicateCount = await countRefs(
        ref.table,
        ref.column,
        pair.duplicate_client_id
      );

      const canonicalCount = await countRefs(
        ref.table,
        ref.column,
        pair.canonical_client_id
      );

      if (duplicateCount === null || canonicalCount === null) {
        continue;
      }

      if (duplicateCount > 0 || canonicalCount > 0) {
        refCounts.push({
          table: ref.table,
          column: ref.column,
          duplicate_count: duplicateCount,
          canonical_count: canonicalCount,
        });
      }
    }

    report.push({
      duplicate_client_id: pair.duplicate_client_id,
      canonical_client_id: pair.canonical_client_id,
      duplicate_client: duplicateClient,
      canonical_client: canonicalClient,
      refs: refCounts,
    });
  }

  console.log("\n=== COLLISION PAIRS REPORT ===\n");

  for (const item of report) {
    console.log(
      `DUPLICATE  : ${item.duplicate_client_id} | ${safeStr(item.duplicate_client?.name)}`
    );
    console.log(
      `CANONICAL  : ${item.canonical_client_id} | ${safeStr(item.canonical_client?.name)}`
    );
    console.log(`DUP TAX ID : ${safeStr(item.duplicate_client?.tax_id)}`);
    console.log(`CAN TAX ID : ${safeStr(item.canonical_client?.tax_id)}`);
    console.log(`DUP HOLDED : ${safeStr(item.duplicate_client?.holded_contact_id)}`);
    console.log(`CAN HOLDED : ${safeStr(item.canonical_client?.holded_contact_id)}`);

    if (item.refs.length === 0) {
      console.log("REFS       : no references found in configured targets");
    } else {
      for (const ref of item.refs) {
        console.log(
          `REF        : ${ref.table}.${ref.column} | duplicate=${ref.duplicate_count} | canonical=${ref.canonical_count}`
        );
      }
    }

    console.log("");
  }

  const outJson = path.join(process.cwd(), "tmp_collision_pairs_report.json");
  const outCsv = path.join(process.cwd(), "tmp_collision_pairs_report.csv");

  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const csvRows: string[] = [];
  csvRows.push(
    [
      "duplicate_client_id",
      "duplicate_name",
      "duplicate_tax_id",
      "duplicate_holded_contact_id",
      "canonical_client_id",
      "canonical_name",
      "canonical_tax_id",
      "canonical_holded_contact_id",
      "ref_table",
      "ref_column",
      "duplicate_ref_count",
      "canonical_ref_count",
    ].join(",")
  );

  for (const item of report) {
    if (item.refs.length === 0) {
      csvRows.push(
        [
          item.duplicate_client_id,
          safeStr(item.duplicate_client?.name),
          safeStr(item.duplicate_client?.tax_id),
          safeStr(item.duplicate_client?.holded_contact_id),
          item.canonical_client_id,
          safeStr(item.canonical_client?.name),
          safeStr(item.canonical_client?.tax_id),
          safeStr(item.canonical_client?.holded_contact_id),
          "",
          "",
          "0",
          "0",
        ]
          .map(csvEscape)
          .join(",")
      );
      continue;
    }

    for (const ref of item.refs) {
      csvRows.push(
        [
          item.duplicate_client_id,
          safeStr(item.duplicate_client?.name),
          safeStr(item.duplicate_client?.tax_id),
          safeStr(item.duplicate_client?.holded_contact_id),
          item.canonical_client_id,
          safeStr(item.canonical_client?.name),
          safeStr(item.canonical_client?.tax_id),
          safeStr(item.canonical_client?.holded_contact_id),
          ref.table,
          ref.column,
          String(ref.duplicate_count),
          String(ref.canonical_count),
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  writeFileSync(outCsv, csvRows.join("\n"), "utf8");

  console.log(`JSON: ${outJson}`);
  console.log(`CSV : ${outCsv}`);
}

main().catch((err) => {
  console.error("\nERROR");
  console.error(err);
  process.exit(1);
});