// src/app/api/control-room/today/route.ts

import { NextRequest, NextResponse } from "next/server";

import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getMadridDateKey(date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return fmt.format(date);
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");

  return `${yy}-${mm}-${dd}`;
}

type RevenueTodayResult = {
  ok: true;
  revenue_today: number;
  rows_count: number;
  source: string;
  query_mode: string;
  warning_fallback: boolean;
};

async function queryRevenueToday(args: {
  supaService: any;
  dateKey: string;
  scope: {
    clientIds: string[];
    actorIds: string[];
    delegateIds: string[];
    mode: string;
  };
  permissions: {
    canViewGlobal: boolean;
    canViewFinance: boolean;
  };
}): Promise<RevenueTodayResult> {
  const { supaService, dateKey, scope, permissions } = args;
  const nextDateKey = addDays(dateKey, 1);

  const canUseGlobalFinance =
    permissions.canViewGlobal && permissions.canViewFinance;

  const visibleClientIds = Array.isArray(scope.clientIds) ? scope.clientIds : [];
  const visibleActorIds = Array.isArray(scope.actorIds) ? scope.actorIds : [];
  const visibleDelegateIds = Array.isArray(scope.delegateIds)
    ? scope.delegateIds
    : [];

  // 1) GLOBAL FINANCE VIEW
  if (canUseGlobalFinance) {
    const { data, error } = await supaService
      .from("invoices")
      .select("id, invoice_date, total_net, source_provider")
      .gte("invoice_date", dateKey)
      .lt("invoice_date", nextDateKey)
      .eq("source_provider", "holded");

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      const revenue_today = rows.reduce(
        (acc: number, row: any) => acc + toNum(row?.total_net, 0),
        0,
      );

      return {
        ok: true,
        revenue_today: Number(revenue_today.toFixed(2)),
        rows_count: rows.length,
        source: "invoices.total_net",
        query_mode: "global_by_invoice_date_and_source_provider",
        warning_fallback: false,
      };
    }
  }

  // 2) CLIENT-SCOPED VIEW
  if (visibleClientIds.length > 0) {
    const { data, error } = await supaService
      .from("invoices")
      .select("id, invoice_date, total_net, client_id")
      .gte("invoice_date", dateKey)
      .lt("invoice_date", nextDateKey)
      .in("client_id", visibleClientIds);

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      const revenue_today = rows.reduce(
        (acc: number, row: any) => acc + toNum(row?.total_net, 0),
        0,
      );

      return {
        ok: true,
        revenue_today: Number(revenue_today.toFixed(2)),
        rows_count: rows.length,
        source: "invoices.total_net",
        query_mode: "scoped_by_client_id",
        warning_fallback: false,
      };
    }
  }

  // 3) DELEGATE-SCOPED VIEW
  if (visibleDelegateIds.length > 0) {
    const { data, error } = await supaService
      .from("invoices")
      .select("id, invoice_date, total_net, delegate_id")
      .gte("invoice_date", dateKey)
      .lt("invoice_date", nextDateKey)
      .in("delegate_id", visibleDelegateIds);

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      const revenue_today = rows.reduce(
        (acc: number, row: any) => acc + toNum(row?.total_net, 0),
        0,
      );

      return {
        ok: true,
        revenue_today: Number(revenue_today.toFixed(2)),
        rows_count: rows.length,
        source: "invoices.total_net",
        query_mode: "scoped_by_delegate_id",
        warning_fallback: false,
      };
    }
  }

  // 4) ACTOR-SCOPED VIEW (fallback if invoices table carries actor ownership)
  if (visibleActorIds.length > 0) {
    const { data, error } = await supaService
      .from("invoices")
      .select("id, invoice_date, total_net, actor_id")
      .gte("invoice_date", dateKey)
      .lt("invoice_date", nextDateKey)
      .in("actor_id", visibleActorIds);

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      const revenue_today = rows.reduce(
        (acc: number, row: any) => acc + toNum(row?.total_net, 0),
        0,
      );

      return {
        ok: true,
        revenue_today: Number(revenue_today.toFixed(2)),
        rows_count: rows.length,
        source: "invoices.total_net",
        query_mode: "scoped_by_actor_id",
        warning_fallback: true,
      };
    }
  }

  // 5) LAST FALLBACK: no romper nunca el dashboard
  return {
    ok: true,
    revenue_today: 0,
    rows_count: 0,
    source: "fallback_zero",
    query_mode: "fallback_zero",
    warning_fallback: true,
  };
}

async function handle(req: Request) {
  let stage = "init";

  try {
    stage = "resolve_dashboard_context";
    const ctx = await resolveDashboardContext(req);

    if (!ctx.ok) {
      return json(ctx.status, {
        ok: false,
        stage,
        error: ctx.error,
        context_stage: ctx.stage ?? null,
      });
    }

    stage = "authorize";
    if (!ctx.permissions.canViewFinance && !ctx.permissions.canViewGlobal) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (control_room.today.read)",
      });
    }

    stage = "date_window";
    const dateKey = getMadridDateKey();

    stage = "query_revenue_today";
    const result = await queryRevenueToday({
      supaService: ctx.supaService,
      dateKey,
      scope: {
        clientIds: ctx.scope.clientIds,
        actorIds: ctx.scope.actorIds,
        delegateIds: ctx.scope.delegateIds,
        mode: ctx.scope.mode,
      },
      permissions: {
        canViewGlobal: ctx.permissions.canViewGlobal,
        canViewFinance: ctx.permissions.canViewFinance,
      },
    });

    return json(200, {
      ok: true,
      date: dateKey,
      timezone: "Europe/Madrid",
      revenue_today: result.revenue_today,
      rows_count: result.rows_count,
      source: result.source,
      query_mode: result.query_mode,
      warning_fallback: result.warning_fallback,

      actor_context: {
        actor: ctx.actor,
        effectiveActor: ctx.effectiveActor,
        roles: ctx.roles,
        scope: {
          mode: ctx.scope.mode,
          label: ctx.scope.label,
          viewAs: ctx.scope.viewAs,
          client_count: ctx.scope.clientIds.length,
          actor_count: ctx.scope.actorIds.length,
          delegate_count: ctx.scope.delegateIds.length,
        },
      },

      summary: {
        revenue_today: result.revenue_today,
      },

      meta: {
        generated_at: new Date().toISOString(),
        domain: "control-room.today",
      },
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}