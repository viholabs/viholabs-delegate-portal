import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type JobItem = {
  id: string;
  name: string;
  source: string | null;
  last_run_at: string | null;
  status: string | null;
  duration_seconds: number | null;
};

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
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function staleStatus(lastRunAt: string | null, currentStatus: string | null): string {
  if (!lastRunAt) return currentStatus ?? "unknown";

  const now = Date.now();
  const ts = new Date(lastRunAt).getTime();

  if (Number.isNaN(ts)) return currentStatus ?? "unknown";

  const minutes = (now - ts) / 1000 / 60;
  if (minutes > 60) return "stale";

  return currentStatus ?? "success";
}

export async function GET(request: NextRequest) {
  const holdedLastRun = await safeJson(request, "/api/control-room/holded-sync/last-run");

  const lastRunAt =
    asString(holdedLastRun?.last_run_at) ??
    asString(holdedLastRun?.last_sync_at) ??
    asString(holdedLastRun?.finished_at) ??
    asString(holdedLastRun?.completed_at);

  const duration =
    asNumber(holdedLastRun?.duration_seconds ?? holdedLastRun?.duration ?? 0);

  const status = staleStatus(lastRunAt, asString(holdedLastRun?.status));

  const jobs: JobItem[] = [
    {
      id: "holded-incremental-import",
      name: "Holded Incremental Import",
      source: "github_actions",
      last_run_at: lastRunAt,
      status,
      duration_seconds: duration,
    },
    {
      id: "control-room-smoke",
      name: "Holded Smoke / Poll",
      source: "github_actions",
      last_run_at: lastRunAt,
      status,
      duration_seconds: duration,
    },
  ];

  return NextResponse.json({
    ok: true,
    jobs,
  });
}