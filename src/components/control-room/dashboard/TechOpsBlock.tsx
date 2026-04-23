"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobItem = {
  id: string;
  name: string;
  source: string;
  last_run_at: string | null;
  status: string;
  duration_seconds: number | null;
  url: string | null;
};

type IntegrationItem = {
  key: string;
  label: string;
  status: string | null;
  last_sync_at: string | null;
  message: string | null;
};

type HoldedLogItem = {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  status: string | null;
  imported: number | null;
  skipped: number | null;
  errors: number | null;
  duration_seconds: number | null;
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null || isNaN(seconds) || seconds === 0) return "";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

type StatusTone = { bg: string; fg: string; dot: string };

function statusTone(status: string | null): StatusTone {
  switch ((status ?? "").toLowerCase()) {
    case "success":
    case "ok":
    case "green":
    case "connected":
      return { bg: "#dcfce7", fg: "#15803d", dot: "#16a34a" };
    case "running":
    case "in_progress":
    case "warning":
    case "amber":
    case "partial":
      return { bg: "#fef3c7", fg: "#92400e", dot: "#d97706" };
    case "failed":
    case "failure":
    case "error":
    case "red":
    case "disconnected":
      return { bg: "#fee2e2", fg: "#991b1b", dot: "#dc2626" };
    case "queued":
    case "stale":
      return { bg: "#ede9fe", fg: "#5b21b6", dot: "#7c3aed" };
    case "cancelled":
    case "skipped":
      return { bg: "#f3f4f6", fg: "#4b5563", dot: "#9ca3af" };
    default:
      return { bg: "#f3f4f6", fg: "#4b5563", dot: "#9ca3af" };
  }
}

function StatusChip({ status }: { status: string | null }) {
  const tone = statusTone(status);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
      background: tone.bg, color: tone.fg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: tone.dot, flexShrink: 0 }} />
      {status ?? "unknown"}
    </span>
  );
}

function Dot({ status }: { status: string | null }) {
  const tone = statusTone(status);
  return (
    <span style={{ width: 9, height: 9, borderRadius: 999, background: tone.dot, flexShrink: 0, display: "inline-block" }} />
  );
}

// ---------------------------------------------------------------------------
// Section title
// ---------------------------------------------------------------------------

function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.65, marginBottom: 8 }}>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub Actions section
// ---------------------------------------------------------------------------

function JobRow({ job }: { job: JobItem }) {
  const content = (
    <div style={{ border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: 9, background: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.name}
        </span>
        <StatusChip status={job.status} />
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 11, opacity: 0.75, flexWrap: "wrap" }}>
        <span>{fmtDate(job.last_run_at)}</span>
        {job.duration_seconds != null && job.duration_seconds > 0 && (
          <span>{fmtDuration(job.duration_seconds)}</span>
        )}
        <span style={{ opacity: 0.6 }}>{job.source}</span>
      </div>
    </div>
  );

  if (job.url) {
    return (
      <a href={job.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </a>
    );
  }
  return content;
}

function JobsSection({ source }: { source: string }) {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGitHub, setIsGitHub] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/control-room/jobs-monitor", { cache: "no-store" });
        const j = await res.json();
        if (!cancelled) {
          setJobs(Array.isArray(j.jobs) ? j.jobs : []);
          setIsGitHub(j.source === "github");
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [source]);

  return (
    <div>
      <SectionTitle label={`GitHub Actions${isGitHub ? "" : " (fallback)"}`} />
      {loading && <span style={{ fontSize: 12, opacity: 0.6 }}>Cargando workflows…</span>}
      {!loading && jobs.length === 0 && (
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {isGitHub
            ? "Sin ejecuciones recientes"
            : "GITHUB_TOKEN no configurado — mostrando último sync de Holded"}
        </span>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {jobs.map((job) => <JobRow key={job.id} job={job} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integrations section
// ---------------------------------------------------------------------------

function HoldedLogs({ logs }: { logs: HoldedLogItem[] }) {
  if (logs.length === 0) return null;
  const last = logs[0];
  return (
    <div style={{ fontSize: 11, opacity: 0.8, display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
      {last.finished_at && <span>Último sync: {fmtDate(last.finished_at)}</span>}
      {last.imported != null && <span>Importados: {last.imported}</span>}
      {last.skipped != null && last.skipped > 0 && <span>Omitidos: {last.skipped}</span>}
      {last.errors != null && last.errors > 0 && <span style={{ color: "#dc2626" }}>Errores: {last.errors}</span>}
      {last.duration_seconds != null && last.duration_seconds > 0 && (
        <span>{fmtDuration(last.duration_seconds)}</span>
      )}
    </div>
  );
}

function IntegrationRow({
  integration,
  holdedLogs,
}: {
  integration: IntegrationItem;
  holdedLogs: HoldedLogItem[];
}) {
  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "9px 10px", background: "rgba(255,255,255,0.7)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Dot status={integration.status} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{integration.label}</span>
        </div>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{integration.message ?? integration.status ?? "—"}</span>
      </div>
      {integration.key === "holded" && holdedLogs.length > 0 && (
        <HoldedLogs logs={holdedLogs} />
      )}
      {integration.key !== "holded" && integration.last_sync_at && (
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          Último sync: {fmtDate(integration.last_sync_at)}
        </div>
      )}
    </div>
  );
}

function IntegrationsSection() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [holdedLogs, setHoldedLogs] = useState<HoldedLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [intRes, logRes] = await Promise.allSettled([
        fetch("/api/control-room/integrations", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/control-room/holded-log", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!cancelled) {
        if (intRes.status === "fulfilled" && intRes.value.ok) {
          setIntegrations(Array.isArray(intRes.value.integrations) ? intRes.value.integrations : []);
        }
        if (logRes.status === "fulfilled" && logRes.value.ok) {
          setHoldedLogs(Array.isArray(logRes.value.items) ? logRes.value.items : []);
        }
        setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <SectionTitle label="Integraciones" />
      {loading && <span style={{ fontSize: 12, opacity: 0.6 }}>Cargando…</span>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {integrations.map((i) => (
          <IntegrationRow key={i.key} integration={i} holdedLogs={holdedLogs} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main block
// ---------------------------------------------------------------------------

export default function TechOpsBlock() {
  return (
    <div style={card}>
      <div style={{ marginBottom: 14 }}>
        <div style={eyebrow}>Operaciones técnicas</div>
        <div style={title}>GitHub Actions & Integraciones</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <JobsSection source="jobs" />
        <IntegrationsSection />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.35)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(251,246,236,0.85)",
  minHeight: 180,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.65,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.2,
  marginTop: 2,
};
