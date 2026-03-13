"use client";

/**
 * VIHOLABS — Z2.1 HOLDed (LOCAL TRUTH + LAST SYNC EVIDENCE)
 * - Reads from /api/holded/imported
 * - No Holded API calls
 * - SUPER_ADMIN via Bearer token
 */

import { useEffect, useMemo, useState } from "react";

type DocType = "invoice" | "creditnote";
type RowStatus = "IMPORTED" | "SKIPPED";

type Row = {
  invoice_id: string | null;
  invoice_number: string | null;
  client_name: string | null;
  invoice_date: string | null;
  invoice_month: string | null; // YYYY-MM
  imported_at: string | null;
  doc_type: DocType;
  row_status: RowStatus;
  skip_reason: string | null;
};

function currentMonthKeyUTC(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function Z2_1HoldedInvoicesThisMonth() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const month = currentMonthKeyUTC();

  async function load() {
    try {
      const res = await fetch("/api/holded/imported", {
        headers: { Authorization: "Bearer 3040V1H0lb54376Quyriux" },
      });

      const text = await res.text();
      if (!text) throw new Error("Empty response");

      const json = JSON.parse(text);
      if (!json?.ok) throw new Error(json?.error || "Failed");

      setRows((json.rows ?? []) as Row[]);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const monthRows = rows.filter((r) => r.invoice_month === month);

    let invoices = 0;
    let creditnotes = 0;
    let imported = 0;
    let skipped = 0;

    for (const r of monthRows) {
      if (r.doc_type === "creditnote") creditnotes++;
      else invoices++;

      if (r.row_status === "IMPORTED") imported++;
      else skipped++;
    }

    return {
      total: monthRows.length,
      invoices,
      creditnotes,
      imported,
      skipped,
    };
  }, [rows, month]);

  const status: "OK" | "DEGRADAT" = error ? "DEGRADAT" : "OK";

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold" style={{ color: "var(--viho-muted)" }}>
          Holded (Z2.1) · Documents del mes en curs
        </div>

        <div className="text-xs font-semibold">
          <span style={{ color: "var(--viho-muted)", marginRight: 8 }}>Estat</span>
          <span
            className="px-2 py-1 rounded-full"
            style={{
              background:
                status === "OK" ? "rgba(0,0,0,0.04)" : "rgba(255,196,0,0.18)",
              color: status === "OK" ? "var(--viho-muted)" : "var(--viho-warning)",
              border: "1px solid var(--viho-border)",
            }}
          >
            {status === "OK" ? "OK" : "Degradat"}
          </span>
        </div>
      </div>

      <div className="mt-2 text-4xl font-semibold">{stats.total}</div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--viho-muted)" }}>
        <div>Factures: <span className="font-semibold">{stats.invoices}</span></div>
        <div>CN: <span className="font-semibold">{stats.creditnotes}</span></div>
        <div>Importades: <span className="font-semibold">{stats.imported}</span></div>
        <div>Skipped: <span className="font-semibold">{stats.skipped}</span></div>
      </div>

      <div className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
        Mes: <span className="font-semibold">{month}</span>
      </div>

      {error ? (
        <div className="mt-2 text-xs" style={{ color: "var(--viho-danger)" }}>
          LOCAL TRUTH error: {error}
        </div>
      ) : null}
    </div>
  );
}