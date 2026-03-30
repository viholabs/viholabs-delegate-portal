"use client";

import { useEffect, useMemo, useState } from "react";

type JobItem = {
  id: string;
  name: string;
  source: string | null;
  last_run_at: string | null;
  status: string | null;
  duration_seconds: number | null;
};

type JobsMonitorResponse = {
  ok: boolean;
  jobs?: JobItem[];
  error?: string;
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES");
}

function fmtDuration(seconds: number | null) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s`;
}

function statusTone(status: string | null) {
  switch ((status || "").toLowerCase()) {
    case "success":
    case "ok":
      return "#1f7a1f";
    case "warning":
    case "partial":
      return "#9a6a00";
    case "error":
    case "failed":
      return "#a61b1b";
    case "stale":
      return "#7c3aed";
    default:
      return "#6b7280";
  }
}

export default function JobsMonitorBlock() {
  const [data, setData] = useState<JobsMonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch("/api/control-room/jobs-monitor", {
          cache: "no-store",
        });
        const json = (await res.json()) as JobsMonitorResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({
            ok: false,
            error: "No s’ha pogut carregar el monitor de jobs.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const jobs = useMemo(() => data?.jobs ?? [], [data]);

  return (
    <div style={card}>
      <div style={eyebrow}>Global State</div>
      <div style={title}>Jobs Monitor</div>

      {loading ? <div style={muted}>Carregant…</div> : null}

      {!loading && data && !data.ok ? (
        <div style={errorText}>{data.error || "Error carregant dades."}</div>
      ) : null}

      {!loading && data?.ok && jobs.length === 0 ? (
        <div style={muted}>Sense jobs detectats.</div>
      ) : null}

      {!loading && data?.ok && jobs.length > 0 ? (
        <div style={list}>
          {jobs.slice(0, 4).map((job) => (
            <div key={job.id} style={row}>
              <div style={rowTop}>
                <div style={jobName}>{job.name}</div>
                <span
                  style={{
                    ...chip,
                    color: statusTone(job.status),
                    borderColor: `${statusTone(job.status)}33`,
                    background: `${statusTone(job.status)}12`,
                  }}
                >
                  {job.status || "unknown"}
                </span>
              </div>

              <div style={meta}>
                <span>{job.source || "source?"}</span>
                <span>{fmtDate(job.last_run_at)}</span>
                <span>{fmtDuration(job.duration_seconds)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.28)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251,246,236,0.78)",
  minHeight: 150,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.2,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
};

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: "#a61b1b",
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const row: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.66)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const jobName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
};

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  padding: "5px 8px",
  borderRadius: 999,
  border: "1px solid transparent",
  textTransform: "uppercase",
};

const meta: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  opacity: 0.86,
};