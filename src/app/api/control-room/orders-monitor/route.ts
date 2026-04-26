// src/app/api/control-room/orders-monitor/route.ts

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

function getMadridDateKey(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

async function queryOrders(args: {
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
      "id, invoice_number, client_name, total_net, currency, invoice_date, is_paid, delegate_id, client_id, ops_owner_actor_id",
    )
    .order("invoice_date", { ascending: false })
    .limit(200);

  if (canGlobal) {
    // global → no filtro
  } else if (scope.clientIds.length > 0) {
    query = query.in("client_id", scope.clientIds);
  } else if (scope.delegateIds.length > 0) {
    query = query.in("delegate_id", scope.delegateIds);
  } else if (scope.actorIds.length > 0) {
    query = query.in("ops_owner_actor_id", scope.actorIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data : [];

  // 👉 lógica simple: no pagadas = abiertas
  const open = rows.filter((r) => !r.is_paid);

  const today = getMadridDateKey();

  const items = open.slice(0, 20).map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    client_name: r.client_name,
    amount: toNum(r.total_net, 0),
    currency: r.currency ?? "EUR",
    date: r.invoice_date,
    status: r.is_paid ? "PAID" : "OPEN",
  }));

  return {
    summary: {
      open: open.length,
      delayed: 0,
      blocked: 0,
      open_amount: Number(
        open.reduce((acc, r) => acc + toNum(r.total_net, 0), 0).toFixed(2),
      ),
      total_count: rows.length,
    },
    items,
    meta: {
      generated_at: new Date().toISOString(),
      today,
      source: "invoices_as_orders",
    },
  };
}

async function handle(req: Request) {
  let stage = "init";

  try {
    stage = "context";
    const ctx = await resolveDashboardContext(req);

    if (!ctx.ok) {
      return json(ctx.status, {
        ok: false,
        stage,
        error: ctx.error,
      });
    }

    stage = "auth";
    if (!ctx.permissions.canViewFinance && !ctx.permissions.canViewGlobal) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado",
      });
    }

    stage = "query";
    const result = await queryOrders({
      supaService: ctx.supaService,
      scope: ctx.scope,
      permissions: ctx.permissions,
    });

    return json(200, {
      ok: true,
      summary: result.summary,
      items: result.items,
      actor_context: {
        actor: ctx.actor,
        scope: ctx.scope,
      },
      meta: result.meta,
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error",
    });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}