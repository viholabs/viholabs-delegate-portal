// src/app/api/control-room/invoices-monitor/route.ts

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

  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / 86400000);
}

type InvoiceMonitorRow = {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  delegate_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  days_overdue: number;
  is_overdue: boolean;
  is_critical: boolean;
};

async function loadDelegatesById(supaService: any, delegateIds: string[]) {
  if (delegateIds.length === 0) {
    return new Map<string, { id: string; name: string | null; email: string | null }>();
  }

  const { data, error } = await supaService
    .from("delegates")
    .select("id, name, email")
    .in("id", delegateIds);

  if (error || !Array.isArray(data)) {
    return new Map<string, { id: string; name: string | null; email: string | null }>();
  }

  return new Map(
    data.map((row: any) => [
      String(row.id),
      {
        id: String(row.id),
        name: row.name ?? null,
        email: row.email ?? null,
      },
    ]),
  );
}

async function queryInvoicesMonitor(args: {
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

  const canUseGlobalFinance =
    permissions.canViewGlobal && permissions.canViewFinance;

  const today = getMadridTodayDateOnly();

  let query = supaService
    .from("invoices")
    .select(
      [
        "id",
        "invoice_number",
        "client_name",
        "delegate_id",
        "invoice_date",
        "due_date",
        "total_net",
        "currency",
        "is_paid",
        "paid_date",
        "state_code",
        "source_provider",
        "client_id",
        "ops_owner_actor_id",
        "document_type",
      ].join(", "),
    )
    .or("is_paid.is.false,is_paid.is.null")
    .neq("state_code", "SETTLED")
    .neq("document_type", "creditnote")
    .order("invoice_date", { ascending: true })
    .limit(500);

  if (canUseGlobalFinance) {
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
    throw new Error(`invoices-monitor: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];

  const delegateIds = Array.from(
    new Set(
      rows
        .map((row: any) => String(row.delegate_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const delegatesById = await loadDelegatesById(supaService, delegateIds);

  const items: InvoiceMonitorRow[] = rows.map((row: any) => {
    const issueDate = row.invoice_date ? String(row.invoice_date) : null;
    const dueDate = row.due_date ? String(row.due_date) : issueDate;
    const daysOverdue =
      dueDate && today > dueDate ? diffDays(today, dueDate) : 0;

    const delegate = row.delegate_id
      ? delegatesById.get(String(row.delegate_id))
      : null;

    return {
      id: String(row.id),
      invoice_number: row.invoice_number ?? null,
      client_name: row.client_name ?? null,
      delegate_id: row.delegate_id ?? null,
      issue_date: issueDate,
      due_date: dueDate,
      amount: toNum(row.total_net, 0),
      currency: row.currency ?? "EUR",
      status: row.state_code ?? (row.is_paid ? "PAID" : "PENDING"),
      days_overdue: daysOverdue,
      is_overdue: daysOverdue > 0,
      is_critical: daysOverdue > 15,
      // campo extra útil para montar respuesta final
      ...(delegate
        ? { __delegate_name: delegate.name ?? delegate.email ?? null }
        : { __delegate_name: null }),
    } as InvoiceMonitorRow & { __delegate_name: string | null };
  });

  const pendingItems = items.filter(
    (item) => String(item.status ?? "").toUpperCase() !== "PAID",
  );

  const overdueItems = pendingItems.filter((item) => item.is_overdue);
  const criticalItems = pendingItems.filter((item) => item.is_critical);

  const summary = {
    pending_count: pendingItems.length,
    pending_amount: Number(
      pendingItems.reduce((acc, item) => acc + toNum(item.amount, 0), 0).toFixed(2),
    ),
    overdue_count: overdueItems.length,
    overdue_amount: Number(
      overdueItems.reduce((acc, item) => acc + toNum(item.amount, 0), 0).toFixed(2),
    ),
    critical_count: criticalItems.length,
    critical_amount: Number(
      criticalItems.reduce((acc, item) => acc + toNum(item.amount, 0), 0).toFixed(2),
    ),
  };

  const finalItems = pendingItems
    .sort((a, b) => {
      if (b.days_overdue !== a.days_overdue) {
        return b.days_overdue - a.days_overdue;
      }
      return toNum(b.amount, 0) - toNum(a.amount, 0);
    })
    .slice(0, 25)
    .map((item: any) => ({
      id: item.id,
      invoice_number: item.invoice_number,
      client_name: item.client_name,
      delegate_name: item.__delegate_name ?? null,
      issue_date: item.issue_date,
      due_date: item.due_date,
      amount: item.amount,
      currency: item.currency,
      status: item.status,
      days_overdue: item.days_overdue,
      is_overdue: item.is_overdue,
      is_critical: item.is_critical,
    }));

  return {
    summary,
    items: finalItems,
    meta: {
      source: canUseGlobalFinance
        ? "invoices.global_holded"
        : scope.clientIds.length > 0
          ? "invoices.client_scope"
          : scope.delegateIds.length > 0
            ? "invoices.delegate_scope"
            : scope.actorIds.length > 0
              ? "invoices.actor_scope"
              : "invoices.fallback_scope",
      generated_at: new Date().toISOString(),
      today,
      loaded_rows: rows.length,
    },
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
        error: "No autorizado (control_room.invoices-monitor.read)",
      });
    }

    stage = "query_invoices_monitor";
    const result = await queryInvoicesMonitor({
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
    });

    return json(200, {
      ok: true,
      summary: result.summary,
      items: result.items,
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
      meta: result.meta,
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