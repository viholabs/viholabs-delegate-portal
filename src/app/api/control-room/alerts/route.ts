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

type InvoiceAtRisk = {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  delegate_name: string | null;
  total_net: number;
  days_overdue: number;
};

function buildAlerts(args: {
  invoices: any[];
  today: string;
  technicalWarningsCount: number;
  scopeLabel: string;
  delegateById?: Map<string, string>;
}): { alerts: AlertItem[]; invoices_at_risk: InvoiceAtRisk[] } {
  const { invoices, today, technicalWarningsCount, scopeLabel, delegateById } = args;

  const withDays = invoices.map((row) => {
    const issueDate = String(row.invoice_date ?? "").trim();
    return { ...row, _days: issueDate ? diffDays(today, issueDate) : -1 };
  });

  const criticalOverdue = withDays.filter((r) => r._days > 15);
  const overdue = withDays.filter((r) => r._days > 0 && r._days <= 15);
  const highAmount = withDays.filter((r) => toNum(r.total_net, 0) >= 1000);
  const reviewNeeded = withDays.filter((r) => r.needs_review === true);

  const alerts: AlertItem[] = [];

  if (criticalOverdue.length > 0) {
    const amount = criticalOverdue.reduce((acc, r) => acc + toNum(r.total_net, 0), 0);
    alerts.push({
      id: "critical-overdue-invoices",
      type: "critical",
      message: `${criticalOverdue.length} facturas críticas (+15 días) en ${scopeLabel}. Importe aprox.: ${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount)}.`,
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
    alerts.push({ id: "no-open-invoices", type: "info", message: "No hay facturas abiertas en el universo visible." });
  }

  const invoices_at_risk: InvoiceAtRisk[] = criticalOverdue
    .sort((a, b) => b._days - a._days)
    .slice(0, 50)
    .map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number ?? null,
      client_name: r.client_name ?? null,
      delegate_name: r.delegate_id && delegateById ? (delegateById.get(r.delegate_id) ?? null) : null,
      total_net: toNum(r.total_net, 0),
      days_overdue: r._days,
    }));

  return { alerts: alerts.slice(0, 5), invoices_at_risk };
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
    // Load delegate names for invoice drill-down
    const delegateIds = [...new Set((invoices as any[]).map((r: any) => r.delegate_id).filter(Boolean))];
    let delegateById = new Map<string, string>();
    if (delegateIds.length > 0) {
      const { data: actors } = await ctx.supaService.from("actors").select("id, name").in("id", delegateIds);
      delegateById = new Map((actors ?? []).map((a: any) => [a.id, a.name ?? a.id]));
    }

    const { alerts, invoices_at_risk } = buildAlerts({
      invoices,
      today,
      technicalWarningsCount,
      scopeLabel: ctx.scope.label,
      delegateById,
    });

    return json(200, {
      ok: true,
      alerts,
      invoices_at_risk,
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