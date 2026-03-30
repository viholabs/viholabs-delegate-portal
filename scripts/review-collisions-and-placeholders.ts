/* eslint-disable no-console */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type ReportRow = {
  client_id: string;
  client_name: string;
  delegate_name: string;
  delegate_id: string;
  client_tax_id: string;
  old_holded_contact_id: string;
  final_holded_contact_id: string;
  final_holded_name: string;
  action: string;
  reason: string;
  score: string;
  notes: string;
};

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

function main() {
  const inPath = path.join(process.cwd(), "tmp_canonize_batch_report.json");
  const raw = readFileSync(inPath, "utf8");
  const rows = JSON.parse(raw) as ReportRow[];

  const collisions = rows.filter((r) => r.action === "review_holded_contact_collision");
  const placeholders = rows.filter((r) => r.action === "skipped_invalid_placeholder");

  console.log("\n=== COLLISIONS ===");
  if (collisions.length === 0) {
    console.log("No collisions");
  } else {
    for (const r of collisions) {
      console.log(
        [
          `client_id=${r.client_id}`,
          `client_name=${r.client_name}`,
          `delegate_name=${r.delegate_name}`,
          `client_tax_id=${r.client_tax_id}`,
          `final_holded_contact_id=${r.final_holded_contact_id}`,
          `final_holded_name=${r.final_holded_name}`,
          `reason=${r.reason}`,
          `score=${r.score}`,
          `notes=${r.notes}`,
        ].join(" | ")
      );
    }
  }

  console.log("\n=== PLACEHOLDERS (first 30) ===");
  if (placeholders.length === 0) {
    console.log("No placeholders");
  } else {
    for (const r of placeholders.slice(0, 30)) {
      console.log(
        [
          `client_id=${r.client_id}`,
          `client_name=${r.client_name}`,
          `delegate_name=${r.delegate_name}`,
          `client_tax_id=${r.client_tax_id}`,
          `notes=${r.notes}`,
        ].join(" | ")
      );
    }
  }

  const collisionsCsvPath = path.join(process.cwd(), "tmp_collisions_readable.csv");
  const placeholdersCsvPath = path.join(process.cwd(), "tmp_placeholders_readable.csv");

  const collisionHeader = [
    "client_id",
    "client_name",
    "delegate_name",
    "delegate_id",
    "client_tax_id",
    "final_holded_contact_id",
    "final_holded_name",
    "reason",
    "score",
    "notes",
  ];

  const placeholderHeader = [
    "client_id",
    "client_name",
    "delegate_name",
    "delegate_id",
    "client_tax_id",
    "notes",
  ];

  const collisionsCsv = [
    collisionHeader.join(","),
    ...collisions.map((r) =>
      collisionHeader.map((k) => csvEscape((r as any)[k])).join(",")
    ),
  ].join("\n");

  const placeholdersCsv = [
    placeholderHeader.join(","),
    ...placeholders.map((r) =>
      placeholderHeader.map((k) => csvEscape((r as any)[k])).join(",")
    ),
  ].join("\n");

  writeFileSync(collisionsCsvPath, collisionsCsv, "utf8");
  writeFileSync(placeholdersCsvPath, placeholdersCsv, "utf8");

  console.log(`\nCSV collisions   : ${collisionsCsvPath}`);
  console.log(`CSV placeholders : ${placeholdersCsvPath}`);
}

main();