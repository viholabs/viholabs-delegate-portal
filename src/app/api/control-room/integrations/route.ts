import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type IntegrationItem = {
  key: string;
  label: string;
  status: string;
  last_sync_at: string | null;
  message: string;
};

function envConfigured(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "";
}

function inferTrafficLight(ok: boolean, stale = false): "green" | "yellow" | "red" {
  if (!ok) return "red";
  if (stale) return "yellow";
  return "green";
}

function parseDate(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
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

function isStale(lastSyncAt: string | null, thresholdMinutes = 60): boolean {
  if (!lastSyncAt) return true;

  const ts = new Date(lastSyncAt).getTime();
  if (Number.isNaN(ts)) return true;

  return Date.now() - ts > thresholdMinutes * 60 * 1000;
}

export async function GET(request: NextRequest) {
  const [holdedPing, shopifyPing, holdedLastRun] = await Promise.all([
    safeJson(request, "/api/holded/ping"),
    safeJson(request, "/api/shopify/ping"),
    safeJson(request, "/api/control-room/holded-sync/last-run"),
  ]);

  const holdedLastSync =
    parseDate(holdedLastRun?.last_run_at) ??
    parseDate(holdedLastRun?.last_sync_at) ??
    parseDate(holdedLastRun?.finished_at) ??
    parseDate(holdedLastRun?.completed_at);

  const holdedOk = !!holdedPing || !!holdedLastRun;
  const holdedStale = isStale(holdedLastSync, 60);

  const shopifyOk = !!shopifyPing;
  const shopifyLastSync =
    parseDate(shopifyPing?.last_sync_at) ??
    parseDate(shopifyPing?.timestamp) ??
    null;

  const bixgrowConfigured =
    envConfigured("BIXGROW_API_KEY") ||
    envConfigured("BIXGROW_APP_ID") ||
    envConfigured("BIXGROW_WEBHOOK_SECRET");

  const supabaseConfigured =
    envConfigured("SUPABASE_URL") ||
    envConfigured("NEXT_PUBLIC_SUPABASE_URL");

  const integrations: IntegrationItem[] = [
    {
      key: "holded",
      label: "Holded",
      status: inferTrafficLight(holdedOk, holdedStale),
      last_sync_at: holdedLastSync,
      message: holdedOk
        ? holdedStale
          ? "Stale sync"
          : "Connected"
        : "Unreachable",
    },
    {
      key: "shopify",
      label: "Shopify",
      status: inferTrafficLight(shopifyOk, !shopifyLastSync),
      last_sync_at: shopifyLastSync,
      message: shopifyOk ? "Connected" : "Not available",
    },
    {
      key: "bixgrow",
      label: "BixGrow",
      status: bixgrowConfigured ? "yellow" : "red",
      last_sync_at: null,
      message: bixgrowConfigured ? "Configured" : "Not configured",
    },
    {
      key: "supabase",
      label: "Supabase",
      status: supabaseConfigured ? "green" : "red",
      last_sync_at: null,
      message: supabaseConfigured ? "Connected" : "Missing env",
    },
  ];

  return NextResponse.json({
    ok: true,
    integrations,
  });
}