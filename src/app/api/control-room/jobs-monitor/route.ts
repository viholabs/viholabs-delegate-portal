import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GITHUB_REPO = "viholabs/viholabs-delegate-portal";

type JobItem = {
  id: string;
  name: string;
  source: string;
  last_run_at: string | null;
  status: string;
  duration_seconds: number | null;
  url: string | null;
};

function mapGhStatus(status: string | null, conclusion: string | null): string {
  if (status === "in_progress") return "running";
  if (status === "queued") return "queued";
  if (status === "completed") {
    if (conclusion === "success") return "success";
    if (conclusion === "failure") return "failed";
    if (conclusion === "cancelled") return "cancelled";
    if (conclusion === "skipped") return "skipped";
    return conclusion ?? "completed";
  }
  return status ?? "unknown";
}

function durationSeconds(createdAt: string | null, updatedAt: string | null): number | null {
  if (!createdAt || !updatedAt) return null;
  const ms = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  return Math.max(0, Math.round(ms / 1000));
}

async function fromGitHub(): Promise<JobItem[] | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=20`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const runs: any[] = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];

    return runs.map((run) => ({
      id: String(run.id),
      name: String(run.display_title ?? run.name ?? "Workflow"),
      source: "github_actions",
      last_run_at: run.updated_at ?? run.created_at ?? null,
      status: mapGhStatus(run.status ?? null, run.conclusion ?? null),
      duration_seconds: run.conclusion
        ? durationSeconds(run.created_at, run.updated_at)
        : null,
      url: run.html_url ?? null,
    }));
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function safeJson(request: NextRequest, path: string): Promise<any | null> {
  try {
    const url = new URL(path, request.nextUrl.origin);
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { cookie: request.headers.get("cookie") || "" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function staleStatus(lastRunAt: string | null): string {
  if (!lastRunAt) return "unknown";
  const minutes = (Date.now() - new Date(lastRunAt).getTime()) / 60000;
  return minutes > 60 ? "stale" : "success";
}

export async function GET(request: NextRequest) {
  const ghJobs = await fromGitHub();

  if (ghJobs !== null) {
    return NextResponse.json({ ok: true, jobs: ghJobs, source: "github" });
  }

  // Fallback: infer from Holded sync state
  const holdedLastRun = await safeJson(request, "/api/control-room/holded-sync/last-run");
  const lastRunAt =
    asString(holdedLastRun?.last_run_at) ??
    asString(holdedLastRun?.last_sync_at) ??
    asString(holdedLastRun?.finished_at) ??
    asString(holdedLastRun?.completed_at);
  const duration = asNumber(holdedLastRun?.duration_seconds ?? holdedLastRun?.duration ?? 0);
  const status = staleStatus(lastRunAt);

  const jobs: JobItem[] = [
    {
      id: "holded-incremental-import",
      name: "Holded Incremental Import",
      source: "holded_sync",
      last_run_at: lastRunAt,
      status,
      duration_seconds: duration,
      url: null,
    },
  ];

  return NextResponse.json({ ok: true, jobs, source: "holded_sync" });
}
