// src/app/api/control-room/month/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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

function isMonth01(s: string) {
  return /^\d{4}-\d{2}-01$/.test(s);
}

function getMadridTodayParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [year, month, day] = fmt.format(date).split("-");
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function getCurrentMonth01Madrid(date = new Date()) {
  const { year, month } = getMadridTodayParts(date);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function nextMonth01(month01: string) {
  const [y, m] = month01.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + 1);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");

  return `${yy}-${mm}-01`;
}

function monthKey(month01: string) {
  return month01.slice(0, 7);
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

type MonthStateCode = "OPEN" | "LOCKED" | "UNKNOWN";

async function getMonthStateCode(admin: any, month01: string): Promise<{
  state_code: MonthStateCode;
  source:
    | "commission_month_locks.period_month"
    | "commission_month_locks.month"
    | "default_open";
  lock_row: any | null;
  warning_fallback: boolean;
}> {
  const monthKeyValue = monthKey(month01);

  {
    const { data, error } = await admin
      .from("commission_month_locks")
      .select("*")
      .eq("period_month", month01)
      .limit(1);

    if (!error && Array.isArray(data) && data[0]) {
      const row = data[0];
      const sc = String(row.state_code ?? "").toUpperCase();
      const state_code: MonthStateCode =
        sc === "LOCKED"
          ? "LOCKED"
          : sc === "OPEN"
            ? "OPEN"
            : row.is_locked === true
              ? "LOCKED"
              : "OPEN";

      return {
        state_code,
        source: "commission_month_locks.period_month",
        lock_row: row,
        warning_fallback: false,
      };
    }
  }

  {
    const { data, error } = await admin
      .from("commission_month_locks")
      .select("*")
      .eq("month", monthKeyValue)
      .limit(1);

    if (!error && Array.isArray(data) && data[0]) {
      const row = data[0];
      const sc = String(row.state_code ?? "").toUpperCase();
      const state_code: MonthStateCode =
        sc === "LOCKED"
          ? "LOCKED"
          : sc === "OPEN"
            ? "OPEN"
            : row.is_locked === true
              ? "LOCKED"
              : "OPEN";

      return {
        state_code,
        source: "commission_month_locks.month",
        lock_row: row,
        warning_fallback: false,
      };
    }
  }

  return {
    state_code: "OPEN",
    source: "default_open",
    lock_row: null,
    warning_fallback: true,
  };
}

async function parseMonthFromRequest(req: Request) {
  const url = new URL(req.url);
  const fromQuery =
    url.searchParams.get("month") || url.searchParams.get("source_month") || "";

  if (isMonth01(String(fromQuery))) {
    return String(fromQuery);
  }

  if (req.method !== "GET") {
    const body = await req.json().catch(() => null);
    const fromBody = String(body?.month ?? body?.source_month ?? "");
    if (isMonth01(fromBody)) {
      return fromBody;
    }
  }

  return getCurrentMonth01Madrid();
}

async function queryScopedInvoices(args: {
  supaService: any;
  month01: string;
  nextMonth01: string;
  scope: {
    clientIds: string[];
    delegateIds: string[];
    actorIds: string[];
  };
  permissions: {
    canViewGlobal: boolean;
    canViewFinance: boolean;
  };
}) {
  const { supaService, month01, nextMonth01, scope, permissions } = args;

  const canUseGlobalFinance =
    permissions.canViewGlobal && permissions.canViewFinance;

  if (canUseGlobalFinance) {
    const { data, error } = await supaService
      .from("invoices")
      .select(
        "id, client_id, delegate_id, invoice_date, total_net, total_gross, source_provider",
      )
      .gte("invoice_date", month01)
      .lt("invoice_date", nextMonth01)
      .eq("source_provider", "holded");

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      return {
        rows,
        source: "invoices.global",
        query_mode: "global_by_invoice_date_and_source_provider",
        warning_fallback: false,
      };
    }
  }

  if (scope.clientIds.length > 0) {
    const { data, error } = await supaService
      .from("invoices")
      .select("id, client_id, delegate_id, invoice_date, total_net, total_gross")
      .gte("invoice_date", month01)
      .lt("invoice_date", nextMonth01)
      .in("client_id", scope.clientIds);

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      return {
        rows,
        source: "invoices.client_scope",
        query_mode: "scoped_by_client_id",
        warning_fallback: false,
      };
    }
  }

  if (scope.delegateIds.length > 0) {
    const { data, error } = await supaService
      .from("invoices")
      .select("id, client_id, delegate_id, invoice_date, total_net, total_gross")
      .gte("invoice_date", month01)
      .lt("invoice_date", nextMonth01)
      .in("delegate_id", scope.delegateIds);

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      return {
        rows,
        source: "invoices.delegate_scope",
        query_mode: "scoped_by_delegate_id",
        warning_fallback: false,
      };
    }
  }

  if (scope.actorIds.length > 0) {
    const { data, error } = await supaService
      .from("invoices")
      .select(
        "id, client_id, delegate_id, ops_owner_actor_id, invoice_date, total_net, total_gross",
      )
      .gte("invoice_date", month01)
      .lt("invoice_date", nextMonth01)
      .in("ops_owner_actor_id", scope.actorIds);

    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      return {
        rows,
        source: "invoices.actor_scope",
        query_mode: "scoped_by_ops_owner_actor_id",
        warning_fallback: true,
      };
    }
  }

  return {
    rows: [],
    source: "fallback_zero",
    query_mode: "fallback_zero",
    warning_fallback: true,
  };
}

async function queryGlobalKpiMonth(admin: any, month01: string) {
  const { data: kpiMonthRows, error } = await admin.rpc("kpi_month_summary_v1", {
    p_month: month01,
  });

  if (error) {
    return {
      ok: false as const,
      error: error.message,
      kpi_month: null,
    };
  }

  const kpi_month = Array.isArray(kpiMonthRows) ? kpiMonthRows[0] : kpiMonthRows;

  return {
    ok: true as const,
    error: null,
    kpi_month: kpi_month ?? null,
  };
}

async function queryScopedCommissionData(args: {
  supaService: any;
  month01: string;
  permissions: {
    canViewGlobal: boolean;
    canViewFinance: boolean;
  };
  scope: {
    clientIds: string[];
    delegateIds: string[];
  };
}) {
  const { supaService, month01, permissions, scope } = args;

  const canUseGlobalFinance =
    permissions.canViewGlobal && permissions.canViewFinance;

  if (canUseGlobalFinance) {
    const { data, error } = await supaService
      .from("commission_monthly")
      .select(
        "beneficiary_type, beneficiary_id, commission_amount, units_sale, units_promotion, period_month, calc_meta",
      )
      .eq("period_month", month01);

    if (!error) {
      return {
        rows: Array.isArray(data) ? data : [],
        source: "commission_monthly.global",
        query_mode: "global",
        warning_fallback: false,
      };
    }
  }

  const scopedRows: any[] = [];

  if (scope.delegateIds.length > 0) {
    const { data, error } = await supaService
      .from("commission_monthly")
      .select(
        "beneficiary_type, beneficiary_id, commission_amount, units_sale, units_promotion, period_month, calc_meta",
      )
      .eq("period_month", month01)
      .eq("beneficiary_type", "delegate")
      .in("beneficiary_id", scope.delegateIds);

    if (!error && Array.isArray(data)) {
      scopedRows.push(...data);
    }
  }

  if (scope.clientIds.length > 0) {
    const { data, error } = await supaService
      .from("commission_monthly")
      .select(
        "beneficiary_type, beneficiary_id, commission_amount, units_sale, units_promotion, period_month, calc_meta",
      )
      .eq("period_month", month01)
      .eq("beneficiary_type", "client_recommender")
      .in("beneficiary_id", scope.clientIds);

    if (!error && Array.isArray(data)) {
      scopedRows.push(...data);
    }
  }

  return {
    rows: scopedRows,
    source: "commission_monthly.scoped",
    query_mode: "delegate_ids_and_client_ids",
    warning_fallback: true,
  };
}

function pickName(obj: any) {
  return obj?.name ?? obj?.contact_email ?? obj?.email ?? "—";
}

async function buildRankings(args: {
  supaService: any;
  commissionRows: any[];
}) {
  const { supaService, commissionRows } = args;

  const totalDevengado = commissionRows.reduce(
    (acc: number, r: any) => acc + Number(r.commission_amount ?? 0),
    0,
  );

  const calcMetas = commissionRows
    .map((r: any) => r.calc_meta)
    .filter(Boolean)
    .slice(0, 50);

  const delegatesRows = commissionRows
    .filter((r: any) => r.beneficiary_type === "delegate")
    .sort(
      (a: any, b: any) =>
        Number(b.commission_amount ?? 0) - Number(a.commission_amount ?? 0),
    )
    .slice(0, 10);

  const recommRows = commissionRows
    .filter((r: any) => r.beneficiary_type === "client_recommender")
    .sort(
      (a: any, b: any) =>
        Number(b.commission_amount ?? 0) - Number(a.commission_amount ?? 0),
    )
    .slice(0, 10);

  const delegateIds = Array.from(
    new Set(delegatesRows.map((r: any) => String(r.beneficiary_id))),
  );
  const recommClientIds = Array.from(
    new Set(recommRows.map((r: any) => String(r.beneficiary_id))),
  );

  const [delegatesRes, clientsRes] = await Promise.all([
    delegateIds.length
      ? supaService
          .from("delegates")
          .select("id, name, email, actor_id")
          .in("id", delegateIds)
      : Promise.resolve({ data: [], error: null } as any),

    recommClientIds.length
      ? supaService
          .from("clients")
          .select("id, name, contact_email, tax_id")
          .in("id", recommClientIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const delegatesById = new Map<string, any>(
    ((delegatesRes.data ?? []) as any[]).map((d: any) => [String(d.id), d]),
  );
  const clientsById = new Map<string, any>(
    ((clientsRes.data ?? []) as any[]).map((c: any) => [String(c.id), c]),
  );

  const rankingsDelegates = delegatesRows.map((r: any) => {
    const d = delegatesById.get(String(r.beneficiary_id));
    return {
      id: String(r.beneficiary_id),
      name: d?.name ?? d?.email ?? "—",
      email: d?.email ?? null,
      units_sale: Number(r.units_sale ?? 0) || 0,
      units_promotion: Number(r.units_promotion ?? 0) || 0,
      commission: Number(r.commission_amount ?? 0) || 0,
    };
  });

  const rankingsRecommenders = recommRows.map((r: any) => {
    const c = clientsById.get(String(r.beneficiary_id));
    return {
      id: String(r.beneficiary_id),
      name: pickName(c),
      contact_email: c?.contact_email ?? null,
      tax_id: c?.tax_id ?? null,
      units_sale: Number(r.units_sale ?? 0) || 0,
      units_promotion: Number(r.units_promotion ?? 0) || 0,
      commission: Number(r.commission_amount ?? 0) || 0,
    };
  });

  return {
    totals: {
      total_devengado_commissions: Number(totalDevengado.toFixed(2)),
    },
    rankingsDelegates,
    rankingsRecommenders,
    calc_meta_sample: calcMetas[0] ?? null,
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
        error: "No autorizado (control_room.month.read)",
      });
    }

    stage = "month_input";
    const month = await parseMonthFromRequest(req);
    if (!isMonth01(month)) {
      return json(422, {
        ok: false,
        stage,
        error: "month inválido (YYYY-MM-01)",
      });
    }

    const monthNext = nextMonth01(month);

    stage = "service_supabase";
    const admin = getServiceSupabase();

    stage = "month_state_code";
    const monthState = await getMonthStateCode(admin, month);

    stage = "global_kpi_month";
    const globalKpi = await queryGlobalKpiMonth(admin, month);

    stage = "scoped_invoices";
    const scopedInvoices = await queryScopedInvoices({
      supaService: ctx.supaService,
      month01: month,
      nextMonth01: monthNext,
      scope: {
        clientIds: ctx.scope.clientIds,
        delegateIds: ctx.scope.delegateIds,
        actorIds: ctx.scope.actorIds,
      },
      permissions: {
        canViewGlobal: ctx.permissions.canViewGlobal,
        canViewFinance: ctx.permissions.canViewFinance,
      },
    });

    const invoiceRows = scopedInvoices.rows ?? [];
    const revenueScoped = invoiceRows.reduce(
      (acc: number, row: any) => acc + toNum(row?.total_net, 0),
      0,
    );

    stage = "commission_rows";
    const scopedCommission = await queryScopedCommissionData({
      supaService: ctx.supaService,
      month01: month,
      permissions: {
        canViewGlobal: ctx.permissions.canViewGlobal,
        canViewFinance: ctx.permissions.canViewFinance,
      },
      scope: {
        clientIds: ctx.scope.clientIds,
        delegateIds: ctx.scope.delegateIds,
      },
    });

    stage = "rankings";
    const rankings = await buildRankings({
      supaService: ctx.supaService,
      commissionRows: scopedCommission.rows,
    });

    const kpiMonth = globalKpi.ok ? globalKpi.kpi_month : null;

    const revenue =
      ctx.permissions.canViewGlobal && ctx.permissions.canViewFinance
        ? toNum(kpiMonth?.revenue, toNum(kpiMonth?.total_net, revenueScoped))
        : Number(revenueScoped.toFixed(2));

    const unitsSold =
      ctx.permissions.canViewGlobal && ctx.permissions.canViewFinance
        ? toNum(kpiMonth?.units_total, toNum(kpiMonth?.units_sale, 0))
        : 0;

    const unitsPromo =
      ctx.permissions.canViewGlobal && ctx.permissions.canViewFinance
        ? toNum(kpiMonth?.units_promotion, toNum(kpiMonth?.units_promo, 0))
        : 0;

    return json(200, {
      ok: true,

      month,
      state_code: monthState.state_code,
      month_state: {
        state_code: monthState.state_code,
        source: monthState.source,
        warning_fallback: monthState.warning_fallback,
        lock_row: monthState.lock_row ?? null,
      },

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

      actor: {
        id: ctx.effectiveActor.id,
        role: ctx.effectiveActor.role ?? "unknown",
        name: ctx.effectiveActor.name ?? ctx.effectiveActor.email ?? "—",
      },

      revenue: Number(revenue.toFixed(2)),
      units_sold: unitsSold,
      units_promo: unitsPromo,

      kpi_month: kpiMonth ?? null,

      totals: rankings.totals,
      rankingsDelegates: rankings.rankingsDelegates,
      rankingsRecommenders: rankings.rankingsRecommenders,

      activity: {
        recent_imports: [],
        calc_meta_sample: rankings.calc_meta_sample,
      },

      meta: {
        generated_at: new Date().toISOString(),
        invoice_source: scopedInvoices.source,
        invoice_query_mode: scopedInvoices.query_mode,
        invoice_warning_fallback: scopedInvoices.warning_fallback,
        commission_source: scopedCommission.source,
        commission_query_mode: scopedCommission.query_mode,
        commission_warning_fallback: scopedCommission.warning_fallback,
        kpi_global_warning_fallback: !globalKpi.ok,
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