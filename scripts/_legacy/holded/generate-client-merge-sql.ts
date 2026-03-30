/* eslint-disable no-console */

import { writeFileSync } from "node:fs";
import path from "node:path";

type MergePair = {
  source_client_id: string;
  target_client_id: string;
  label: string;
  transfer_holded_contact_id?: string;
};

const MERGE_PAIRS: MergePair[] = [
  {
    source_client_id: "f8e46f44-906f-45a9-a6ac-306f6e805add",
    target_client_id: "51661407-9f1b-450c-aff4-7a0dd6ca4595",
    label: "BLANCA GALOFRE MUNNE -> BLANCA GALOFRÉ MUNNÉ (HOMEDICAL)",
  },
  {
    source_client_id: "8deeed7c-8236-435b-bc68-848230750a45",
    target_client_id: "070edcff-ecd1-4516-96cd-2b72abb93299",
    label: "Encarnacion Martin Ruiz -> Encarnacion Martín Ruiz",
  },
  {
    source_client_id: "c69b3ea0-4889-44f9-8205-7fad303c823f",
    target_client_id: "85c9287e-2ba9-4336-a5b9-70c8f217b2f7",
    label: "Monica Falla Pérez -> Mònica Falla Pérez",
  },
  {
    source_client_id: "08ffcd0e-54ee-4e35-9b16-8cac2d0f3188",
    target_client_id: "609be93a-3f39-4289-8e6d-a010163af9af",
    label: "Monica Ramirez Guirao -> Mónica Ramírez Guirao",
  },
  {
    source_client_id: "3efabc7c-f3f4-43f5-a974-7c4360afea4c",
    target_client_id: "dd0effca-6a28-464c-9a54-98fc393a33dd",
    label: "Silvina Flavia Sanchez -> Silvina Flavia Sánchez",
  },

  // Caso especial Ivette:
  // el que hoy parece duplicado tiene referencias reales,
  // así que lo tratamos como target maestro.
  {
    source_client_id: "cb130d88-7ca6-4084-b892-bdd44eae8970",
    target_client_id: "ae9c7cd1-9918-452b-b7d5-d6e77a5006ed",
    label: "Ivette Fernandez Tornero -> Ivette Fernández Tornero",
    transfer_holded_contact_id: "695b763a3857a4886a00c390",
  },
];

const REFERENCE_TARGETS = [
  { table: "orders", column: "client_id" },
  { table: "draft_orders", column: "client_id" },
  { table: "invoices", column: "client_id" },
  { table: "client_assignments", column: "client_id" },
  { table: "client_aliases", column: "client_id" },
  { table: "client_addresses", column: "client_id" },
  { table: "client_contacts", column: "client_id" },
  { table: "client_notes", column: "client_id" },
  { table: "client_tags", column: "client_id" },
  { table: "actor_client_assignments", column: "client_id" },
  { table: "delegate_clients", column: "client_id" },
  { table: "commission_lines", column: "client_id" },
  { table: "commission_draft_lines", column: "client_id" },
  { table: "settlement_lines", column: "client_id" },
  { table: "shipments", column: "client_id" },
  { table: "credit_notes", column: "client_id" },
];

function q(v: string): string {
  return `'${v}'`;
}

function main() {
  const sql: string[] = [];

  sql.push("-- =====================================================");
  sql.push("-- VIHOLABS — PROPOSED CLIENT MERGE SQL");
  sql.push("-- GENERATED AUTOMATICALLY");
  sql.push("-- REVIEW BEFORE EXECUTION");
  sql.push("-- =====================================================");
  sql.push("");
  sql.push("begin;");
  sql.push("");

  for (const pair of MERGE_PAIRS) {
    sql.push("-- -----------------------------------------------------");
    sql.push(`-- ${pair.label}`);
    sql.push(`-- source: ${pair.source_client_id}`);
    sql.push(`-- target: ${pair.target_client_id}`);
    sql.push("-- -----------------------------------------------------");
    sql.push("");

    for (const ref of REFERENCE_TARGETS) {
      sql.push(
        `update ${ref.table}
set ${ref.column} = ${q(pair.target_client_id)}
where ${ref.column} = ${q(pair.source_client_id)};`
      );
      sql.push("");
    }

    if (pair.transfer_holded_contact_id) {
      sql.push(
        `update clients
set holded_contact_id = ${q(pair.transfer_holded_contact_id)}
where id = ${q(pair.target_client_id)}
  and (holded_contact_id is null or holded_contact_id = '');`
      );
      sql.push("");
    }

    sql.push(
      `update client_merge_audit
set target_client_id = ${q(pair.target_client_id)}
where target_client_id = ${q(pair.source_client_id)};`
    );
    sql.push("");

    sql.push(
      `update client_merge_audit
set source_client_id = ${q(pair.target_client_id)}
where source_client_id = ${q(pair.source_client_id)};`
    );
    sql.push("");

    sql.push(
      `update clients
set holded_contact_id = null
where id = ${q(pair.source_client_id)};`
    );
    sql.push("");

    sql.push(
      `-- delete from clients where id = ${q(pair.source_client_id)};`
    );
    sql.push("");
  }

  sql.push("-- review results first, then commit");
  sql.push("-- commit;");
  sql.push("-- rollback;");
  sql.push("");

  const outPath = path.join(process.cwd(), "tmp_client_merge_plan.sql");
  writeFileSync(outPath, sql.join("\n"), "utf8");

  console.log(`OK: ${outPath}`);
}

main();
