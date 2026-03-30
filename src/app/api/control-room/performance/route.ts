// src/app/api/control-room/actors-monitor/route.ts

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

async function loadActors(supaService: any, scope: any, permissions: any) {
  if (permissions.canViewGlobal) {
    const { data } = await supaService
      .from("actors")
      .select("id, name, email")
      .limit(1000);

    return Array.isArray(data) ? data : [];
  }

  if (scope.actorIds.length > 0) {
    const { data } = await supaService
      .from("actors")
      .select("id, name, email")
      .in("id", scope.actorIds);

    return Array.isArray(data) ? data : [];
  }

  return [];
}

async function loadInvoices(supaService: any, scope: any, permissions: any) {
  let query = supaService
    .from("invoices")
    .select(
      "id, total_net, delegate_id, ops_owner_actor_id, client_id, is_paid",
    )
    .limit(5000);

  if (permissions.canViewGlobal) {
    // no filter
  } else if (scope.clientIds.length > 0) {
    query = query.in("client_id", scope.clientIds);
  }

  const { data } = await query;

  return Array.isArray(data) ? data : [];
}

async function loadAssignments(supaService: any) {
  const { data } = await supaService
    .from("client_actor_assignments_g1")
    .select("actor_id, assignment_role, client_holded_contact_id")
    .is("valid_to", null);

  return Array.isArray(data) ? data : [];
}

async function buildActorsMonitor(args: {
  supaService: any;
  scope: any;
  permissions: any;
}) {
  const { supaService, scope, permissions } = args;

  const [actors, invoices, assignments] = await Promise.all([
    loadActors(supaService, scope, permissions),
    loadInvoices(supaService, scope, permissions),
    loadAssignments(supaService),
  ]);

  const salesByActor = new Map<string, number>();
  const clientsByActor = new Map<string, Set<string>>();

  // 👉 ventas por delegate
  for (const inv of invoices) {
    const delegateId = inv.delegate_id;
    if (delegateId) {
      salesByActor.set(
        delegateId,
        toNum(salesByActor.get(delegateId), 0) + toNum(inv.total_net, 0),
      );
    }

    const owner = inv.ops_owner_actor_id;
    if (owner) {
      salesByActor.set(
        owner,
        toNum(salesByActor.get(owner), 0) + toNum(inv.total_net, 0),
      );
    }
  }

  // 👉 clientes asignados
  for (const row of assignments) {
    const actorId = row.actor_id;
    if (!actorId) continue;

    if (!clientsByActor.has(actorId)) {
      clientsByActor.set(actorId, new Set());
    }

    clientsByActor
      .get(actorId)!
      .add(String(row.client_holded_contact_id));
  }

  const items = actors.map((actor: any) => {
    const actorId = String(actor.id);

    const sales = toNum(salesByActor.get(actorId), 0);
    const clients = clientsByActor.get(actorId)?.size ?? 0;

    return {
      id: actorId,
      name: actor.name ?? actor.email ?? "—",
      email: actor.email ?? null,
      sales_month: Number(sales.toFixed(2)),
      clients_assigned: clients,
      performance_level:
        sales > 10000
          ? "high"
          : sales > 3000
          ? "medium"
          : "low",
    };
  });

  const summary = {
    total_actors: items.length,
    active_actors: items.filter((a) => a.sales_month > 0).length,
    inactive_actors: items.filter((a) => a.sales_month === 0).length,
  };

  return {
    summary,
    items: items
      .sort((a, b) => b.sales_month - a.sales_month)
      .slice(0, 25),
    meta: {
      generated_at: new Date().toISOString(),
      source: "actors + invoices + assignments",
    },
  };
}

async function handle(req: Request) {
  let stage = "init";

  try {
    const ctx = await resolveDashboardContext(req);

    if (!ctx.ok) {
      return json(ctx.status, {
        ok: false,
        error: ctx.error,
      });
    }

    if (!ctx.permissions.canViewGlobal && !ctx.permissions.canViewFinance) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const result = await buildActorsMonitor({
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