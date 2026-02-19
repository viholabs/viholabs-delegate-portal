"use client";

import { useEffect, useState } from "react";

type Row = {
  job: string;
  ok: boolean;
  stage: string | null;
  error_message: string | null;
  total_ids: number | null;
  imported: number | null;
  failed: number | null;
  advanced: boolean | null;
  started_at: string | null;
  finished_at: string | null;
  mode: string | null;
  github_run_id: string | null;
  github_repo: string | null;
  github_sha: string | null;
};

function minutesSince(ts: string | null): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 60000);
}

function classifyFailure(msg: string | null | undefined): "CONFIG" | "HOLDED" | "SUPABASE" | "UNKNOWN" {
  const s = String(msg ?? "").toLowerCase();
  if (!s) return "UNKNOWN";
  if (s.includes("missing env")) return "CONFIG";
  if (s.includes("holded")) return "HOLDED";
  if (s.includes("supabase") || s.includes("rls") || s.includes("permission denied")) return "SUPABASE";
  return "UNKNOWN";
}

export default function Z2_3HoldedSyncStatus() {
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/control-room/holded-sync/last-run", {
        headers: { Authorization: "Bearer 3040V1H0lb54376Quyriux" },
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed");

      setRow(json.row ?? null);
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

  const mins = minutesSince(row?.finished_at ?? null);
  const failedN = Number(row?.failed ?? 0);

  // ✅ Canon: failed > 0 => FAIL even if row.ok is true
  let status: "OK" | "FAIL" | "STALE" = "STALE";
  if (row) {
    if (failedN > 0) status = "FAIL";
    else if (row.ok === true) status = "OK";
    else if (row.ok === false) status = "FAIL";
  }
  if (status === "OK" && mins !== null && mins > 30) status = "STALE";

  const failureKind = status === "FAIL" ? classifyFailure(row?.error_message) : null;

  const color =
    status === "OK"
      ? "var(--viho-success)"
      : status === "FAIL"
      ? "var(--viho-danger)"
      : "var(--viho-warning)";

  const evidenceUrl =
    row?.github_repo && row?.github_run_id
      ? `https://github.com/${row.github_repo}/actions/runs/${row.github_run_id}`
      : null;

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold" style={{ color }}>
          HOLDed Sync — {status}
          {status === "FAIL" && failureKind ? ` (${failureKind})` : ""}
        </div>

        {evidenceUrl ? (
          <a
            href={evidenceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold underline"
            style={{ color: "var(--viho-primary)" }}
          >
            Open Evidence
          </a>
        ) : null}
      </div>

      {error ? (
        <div className="text-xs mt-2" style={{ color: "var(--viho-danger)" }}>
          {error}
        </div>
      ) : row ? (
        <div className="text-xs mt-2 space-y-1" style={{ color: "var(--viho-muted)" }}>
          <div>
            Última execució: {row.finished_at ?? "—"}
            {mins !== null ? ` (fa ${mins} min)` : ""}
          </div>
          <div>Registres: {row.total_ids ?? 0}</div>
          <div>Importades: {row.imported ?? 0}</div>
          <div>Errors: {row.failed ?? 0}</div>
          {status === "FAIL" ? (
            <div className="mt-2" style={{ color: "var(--viho-danger)" }}>
              {row.error_message ?? "Error sense missatge"}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-xs mt-2">Sense dades</div>
      )}
    </div>
  );
}
