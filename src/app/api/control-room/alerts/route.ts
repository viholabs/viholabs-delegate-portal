// src/app/api/control-room/alerts/route.ts

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

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getMadridTodayDateOnly(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return fmt.format(date);
}

function diffDays(dateA: string, dateB: string) {
  const a = new Date(`${dateA}T00:00:00Z`);
  const b = new Date(`${dateB}T00:00:00Z`);
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

type AlertItem = {
  id: string;
  type: "critical" | "warning" | "info";
  message: string;
};

async function loadOpenInvoicesForAlerts(args: {
  supaService: any;
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
  const { supaService, scope, permissions } = args;

  const canGlobal = permissions.canViewGlobal && permissions.canViewFinance;

  let query = supaService
    .from("invoices")
    .select(
      [
        "id",
        "invoice_number",
        "client_name",
        "client_id",
        "delegate_id",
        "ops_owner_actor_id",
        "invoice_date",
        "total_net",
        "currency",
        "is_paid",
        "state_code",
        "source_provider",
        "needs_review",
      ].join(", "),
    )
    .or("is_paid.is.false,is_paid.is.null")
    .order("invoice_date", { ascending: true })
    .limit(500);

  if (canGlobal) {
    query = query.eq("source_provider", "holded");
  } else if (scope.clientIds.length > 0) {
    query = query.in("client_id", scope.clientIds);
  } else if (scope.delegateIds.length > 0) {
    query = query.in("delegate_id", scope.delegateIds);
  } else if (scope.actorIds.length > 0) {
    query = query.in("ops_owner_actor_id", scope.actorIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`alerts.invoices: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function loadTechnicalWarningsCount(supaService: any) {
  const { data, error } = await supaService
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("needs_review", true);

  if (error) return 0;
  return Number(data?.length ?? 0);
}

function buildAlerts(args: {
  invoices: any[];
  today: string;
  technicalWarningsCount: number;
  scopeLabel: string;
}): AlertItem[] {
  const { invoices, today, technicalWarningsCount, scopeLabel } = args;

  const criticalOverdue = invoices.filter((row) => {
    const issueDate = String(row.invoice_date ?? "").trim();
    if (!issueDate) return false;
    return diffDays(today, issueDate) > 15;
  });

  const overdue = invoices.filter((row) => {
    const issueDate = String(row.invoice_date ?? "").trim();
    if (!issueDate) return false;
    const days = diffDays(today, issueDate);
    return days > 0 && days <= 15;
  });

  const highAmount = invoices.filter((row) => toNum(row.total_net, 0) >= 1000);

  const reviewNeeded = invoices.filter((row) => row.needs_review === true);

  const alerts: AlertItem[] = [];

  if (criticalOverdue.length > 0) {
    const amount = criticalOverdue.reduce(
      (acc, row) => acc + toNum(row.total_net, 0),
      0,
    );

    alerts.push({
      id: "critical-overdue-invoices",
      type: "critical",
      message: `${criticalOverdue.length} facturas críticas (+15 días) en ${scopeLabel}. Importe aprox.: ${new Intl.NumberFormat(
        "es-ES",
        {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        },
      ).format(amount)}.`,
    });
  }

  if (overdue.length > 0) {
    alerts.push({
      id: "overdue-invoices",
      type: "warning",
      message: `${overdue.length} facturas vencidas pendientes dentro del universo visible.`,
    });
  }

  if (highAmount.length > 0) {
    alerts.push({
      id: "high-amount-open-invoices",
      type: "warning",
      message: `${highAmount.length} facturas abiertas con importe alto (>= 1.000 €).`,
    });
  }

  if (reviewNeeded.length > 0 || technicalWarningsCount > 0) {
    alerts.push({
      id: "review-needed",
      type: "info",
      message: `${Math.max(reviewNeeded.length, technicalWarningsCount)} registros requieren revisión técnica u operativa.`,
    });
  }

  if (invoices.length === 0) {
    alerts.push({
      id: "no-open-invoices",
      type: "info",
      message: "No hay facturas abiertas en el universo visible.",
    });
  }

  return alerts.slice(0, 5);
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
        error: "No autorizado (control_room.alerts.read)",
      });
    }

    stage = "load_data";
    const today = getMadridTodayDateOnly();

    const [invoices, technicalWarningsCount] = await Promise.all([
      loadOpenInvoicesForAlerts({
        supaService: ctx.supaService,
        scope: {
          clientIds: ctx.scope.clientIds,
          delegateIds: ctx.scope.delegateIds,
          actorIds: ctx.scope.actorIds,
        },
        permissions: {
          canViewGlobal: ctx.permissions.canViewGlobal,
          canViewFinance: ctx.permissions.canViewFinance,
        },
      }),
      loadTechnicalWarningsCount(ctx.supaService),
    ]);

    stage = "build_alerts";
    const alerts = buildAlerts({
      invoices,
      today,
      technicalWarningsCount,
      scopeLabel: ctx.scope.label,
    });

    return json(200, {
      ok: true,
      alerts,
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
      meta: {
        generated_at: new Date().toISOString(),
        today,
        open_invoices_loaded: invoices.length,
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