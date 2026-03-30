import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type WarningItem = {
  id: string;
  type: "warning";
  domain: string;
  message: string;
};

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function asString(value: unknown): string | null {
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

function pushWarning(
  warnings: WarningItem[],
  id: string,
  domain: string,
  message: string | null | undefined,
) {
  if (!message) return;
  warnings.push({
    id,
    type: "warning",
    domain,
    message,
  });
}

export async function GET(request: NextRequest) {
  const [health, lastRun, latestLogs] = await Promise.all([
    safeJson(request, "/api/control-room/el-elyon/holded-health"),
    safeJson(request, "/api/control-room/holded-sync/last-run"),
    safeJson(request, "/api/control-room/tech/logs/latest"),
  ]);

  const warnings: WarningItem[] = [];

  const contactsWithoutMapping = asNumber(
    health?.contacts_without_mapping ?? health?.summary?.contacts_without_mapping,
  );
  const clientsWithoutMapping = asNumber(
    health?.clients_without_mapping ?? health?.summary?.clients_without_mapping,
  );
  const invoicesWithoutMapping = asNumber(
    health?.invoices_without_mapping ?? health?.summary?.invoices_without_mapping,
  );
  const duplicatedInvoices = asNumber(
    health?.duplicated_invoices ?? health?.summary?.duplicated_invoices,
  );

  if (contactsWithoutMapping > 0) {
    pushWarning(
      warnings,
      "contacts-without-mapping",
      "holded",
      `${contactsWithoutMapping} contacts without mapping`,
    );
  }

  if (clientsWithoutMapping > 0) {
    pushWarning(
      warnings,
      "clients-without-mapping",
      "clients",
      `${clientsWithoutMapping} clients without mapping`,
    );
  }

  if (invoicesWithoutMapping > 0) {
    pushWarning(
      warnings,
      "invoices-without-mapping",
      "invoices",
      `${invoicesWithoutMapping} invoices without mapping`,
    );
  }

  if (duplicatedInvoices > 0) {
    pushWarning(
      warnings,
      "duplicated-invoices",
      "holded",
      `${duplicatedInvoices} duplicated invoices detected`,
    );
  }

  const lastRunAt =
    asString(lastRun?.last_run_at) ??
    asString(lastRun?.last_sync_at) ??
    asString(lastRun?.finished_at) ??
    asString(lastRun?.completed_at);

  if (!lastRunAt) {
    pushWarning(warnings, "pipeline-unknown", "pipeline", "Pipeline last run unknown");
  } else {
    const ts = new Date(lastRunAt).getTime();
    const stale = Number.isNaN(ts) || Date.now() - ts > 60 * 60 * 1000;
    if (stale) {
      pushWarning(warnings, "pipeline-stale", "pipeline", "Pipeline stale");
    }
  }

  const latestStatus =
    asString(latestLogs?.status) ??
    asString(latestLogs?.last_status) ??
    asString(lastRun?.status);

  if (latestStatus && ["error", "failed"].includes(latestStatus.toLowerCase())) {
    pushWarning(warnings, "sync-errors", "holded", "Recent sync errors detected");
  }

  return NextResponse.json({
    ok: true,
    warnings,
  });
}