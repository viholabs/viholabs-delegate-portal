import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

function normalizeLatestLogs(payload: any): HoldedLogItem[] {
  const items = asArray<any>(payload?.items ?? payload?.logs ?? payload?.rows ?? payload?.data);

  return items.slice(0, 8).map((item, index) => ({
    id: asString(item?.id) ?? `holded-log-${index + 1}`,
    started_at: asString(item?.started_at) ?? asString(item?.created_at),
    finished_at: asString(item?.finished_at) ?? asString(item?.updated_at),
    status: asString(item?.status) ?? asString(item?.state_code) ?? "unknown",
    imported: asNumber(item?.imported ?? item?.imported_count ?? item?.processed ?? 0),
    skipped: asNumber(item?.skipped ?? item?.skipped_count ?? 0),
    errors: asNumber(item?.errors ?? item?.error_count ?? 0),
    duration_seconds: asNumber(item?.duration_seconds ?? item?.duration ?? 0),
  }));
}

function normalizeLastRun(payload: any): HoldedLogItem[] {
  if (!payload || typeof payload !== "object") return [];

  const startedAt =
    asString(payload?.started_at) ??
    asString(payload?.last_run_at) ??
    asString(payload?.last_sync_at);

  const finishedAt =
    asString(payload?.finished_at) ??
    asString(payload?.completed_at) ??
    asString(payload?.last_success_at) ??
    startedAt;

  if (!startedAt && !finishedAt) return [];

  return [
    {
      id: asString(payload?.id) ?? "holded-last-run",
      started_at: startedAt,
      finished_at: finishedAt,
      status: asString(payload?.status) ?? "unknown",
      imported: asNumber(payload?.imported ?? payload?.imported_count ?? 0),
      skipped: asNumber(payload?.skipped ?? payload?.skipped_count ?? 0),
      errors: asNumber(payload?.errors ?? payload?.error_count ?? 0),
      duration_seconds: asNumber(payload?.duration_seconds ?? payload?.duration ?? 0),
    },
  ];
}

export async function GET(request: NextRequest) {
  const [latestLogs, lastRun] = await Promise.all([
    safeJson(request, "/api/control-room/tech/logs/latest"),
    safeJson(request, "/api/control-room/holded-sync/last-run"),
  ]);

  const fromLogs = normalizeLatestLogs(latestLogs);
  const fromLastRun = normalizeLastRun(lastRun);

  const seen = new Set<string>();
  const items = [...fromLogs, ...fromLastRun].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return NextResponse.json({
    ok: true,
    items,
  });
}