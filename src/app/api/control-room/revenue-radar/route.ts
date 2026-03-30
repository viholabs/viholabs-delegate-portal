// src/app/api/control-room/revenue-radar/route.ts

import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniq(arr: any[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function getMonthRangeMadrid(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  });

  const [y, m] = fmt.format(date).split("-");
  const start = `${y}-${m}-01`;

  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);

  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const end = `${yy}-${mm}-01`;

  return { start, end };
}

async function loadInvoices(args: {
  supaService: any;
  scope: any;
  permissions: any;
}) {
  const { supaService, scope, permissions } = args;

  const { start, end } = getMonthRangeMadrid();

  let query = supaService
    .from("invoices")
    .select(
      "id, client_id, total_net, is_paid, source_channel, source_provider, invoice_date",
    )
    .gte("invoice_date", start)
    .lt("invoice_date", end)
    .limit(5000);

  if (permissions.canViewGlobal) {
    query = query.eq("source_provider", "holded");
  } else if (scope.clientIds.length > 0) {
    query = query.in("client_id", scope.clientIds);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return Array.isArray(data) ? data : [];
}

async function buildRevenueRadar(args: {
  supaService: any;
  scope: any;
  permissions: any;
}) {
  const { supaService, scope, permissions } = args;

  const invoices = await loadInvoices({
    supaService,
    scope,
    permissions,
  });

  let total = 0;
  let paid = 0;
  let pending = 0;

  const byChannel = new Map<string, number>();
  const byProvider = new Map<string, number>();
  const byClient = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const inv of invoices) {
    const amount = toNum(inv.total_net, 0);
    total += amount;

    if (inv.is_paid) {
      paid += amount;
    } else {
      pending += amount;
    }

    const ch = inv.source_channel || "unknown";
    byChannel.set(ch, toNum(byChannel.get(ch)) + amount);

    const pr = inv.source_provider || "unknown";
    byProvider.set(pr, toNum(byProvider.get(pr)) + amount);

    const cl = inv.client_id || "unknown";
    byClient.set(cl, toNum(byClient.get(cl)) + amount);

    const day = String(inv.invoice_date ?? "");
    if (day) {
      byDay.set(day, toNum(byDay.get(day)) + amount);
    }
  }

  const topClients = Array.from(byClient.entries())
    .map(([client_id, revenue]) => ({
      client_id,
      revenue: Number(revenue.toFixed(2)),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const channelDistribution = Array.from(byChannel.entries()).map(
    ([channel, revenue]) => ({
      channel,
      revenue: Number(revenue.toFixed(2)),
    }),
  );

  const providerDistribution = Array.from(byProvider.entries()).map(
    ([provider, revenue]) => ({
      provider,
      revenue: Number(revenue.toFixed(2)),
    }),
  );

  const days = Array.from(byDay.entries()).sort(
    (a, b) => a[0].localeCompare(b[0]),
  );

  const lastDays = days.slice(-7);
  const prevDays = days.slice(-14, -7);

  const avgLast =
    lastDays.reduce((acc, [, v]) => acc + v, 0) /
    Math.max(lastDays.length, 1);

  const avgPrev =
    prevDays.reduce((acc, [, v]) => acc + v, 0) /
    Math.max(prevDays.length, 1);

  const trend =
    avgLast > avgPrev ? "up" : avgLast < avgPrev ? "down" : "flat";

  return {
    summary: {
      total_revenue: Number(total.toFixed(2)),
      paid_revenue: Number(paid.toFixed(2)),
      pending_revenue: Number(pending.toFixed(2)),
      paid_ratio: total > 0 ? Number((paid / total).toFixed(2)) : 0,
      trend,
    },
    channel_distribution: channelDistribution,
    provider_distribution: providerDistribution,
    top_clients: topClients,
    meta: {
      invoices_count: invoices.length,
      generated_at: new Date().toISOString(),
    },
  };
}

async function handle(req: Request) {
  try {
    const ctx = await resolveDashboardContext(req);

    if (!ctx.ok) {
      return json(ctx.status, { ok: false, error: ctx.error });
    }

    if (!ctx.permissions.canViewFinance && !ctx.permissions.canViewGlobal) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const result = await buildRevenueRadar({
      supaService: ctx.supaService,
      scope: ctx.scope,
      permissions: ctx.permissions,
    });

    return json(200, {
      ok: true,
      ...result,
      actor_context: {
        actor: ctx.actor,
        scope: ctx.scope,
      },
    });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}