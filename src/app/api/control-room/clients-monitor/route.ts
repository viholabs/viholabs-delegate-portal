// src/app/api/control-room/clients-monitor/route.ts

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

function uniq(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v ?? "").trim())
        .filter((v) => v.length > 0),
    ),
  );
}

async function loadScopedClients(args: {
  supaService: any;
  scope: {
    clientIds: string[];
    clientHoldedContactIds: string[];
  };
  permissions: {
    canViewGlobal: boolean;
  };
}) {
  const { supaService, scope, permissions } = args;

  if (permissions.canViewGlobal) {
    const { data, error } = await supaService
      .from("clients")
      .select("id, name, holded_contact_id, contact_email")
      .order("name", { ascending: true })
      .limit(1000);

    if (error) {
      throw new Error(`clients-monitor.clients.global: ${error.message}`);
    }

    return Array.isArray(data) ? data : [];
  }

  if (scope.clientIds.length > 0) {
    const { data, error } = await supaService
      .from("clients")
      .select("id, name, holded_contact_id, contact_email")
      .in("id", scope.clientIds)
      .order("name", { ascending: true })
      .limit(1000);

    if (error) {
      throw new Error(`clients-monitor.clients.by_id: ${error.message}`);
    }

    return Array.isArray(data) ? data : [];
  }

  if (scope.clientHoldedContactIds.length > 0) {
    const { data, error } = await supaService
      .from("clients")
      .select("id, name, holded_contact_id, contact_email")
      .in("holded_contact_id", scope.clientHoldedContactIds)
      .order("name", { ascending: true })
      .limit(1000);

    if (error) {
      throw new Error(`clients-monitor.clients.by_holded: ${error.message}`);
    }

    return Array.isArray(data) ? data : [];
  }

  return [];
}

async function loadAssignmentsForHoldedContacts(
  supaService: any,
  holdedContactIds: string[],
) {
  if (holdedContactIds.length === 0) return [];

  const { data, error } = await supaService
    .from("client_actor_assignments_g1")
    .select(
      "actor_id, client_holded_contact_id, assignment_role, valid_from, valid_to, source",
    )
    .in("client_holded_contact_id", holdedContactIds)
    .is("valid_to", null);

  if (error) {
    throw new Error(`clients-monitor.assignments: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function loadOpenInvoicesForClients(
  supaService: any,
  clientIds: string[],
) {
  if (clientIds.length === 0) return [];

  const { data, error } = await supaService
    .from("invoices")
    .select("id, client_id, is_paid, needs_review, total_net, invoice_date, state_code")
    .in("client_id", clientIds)
    .or("is_paid.is.false,is_paid.is.null")
    .limit(2000);

  if (error) {
    throw new Error(`clients-monitor.invoices: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function loadActorsByIds(supaService: any, actorIds: string[]) {
  if (actorIds.length === 0) {
    return new Map<string, { id: string; name: string | null; email: string | null }>();
  }

  const { data, error } = await supaService
    .from("actors")
    .select("id, name, email")
    .in("id", actorIds);

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

async function buildClientsMonitor(args: {
  supaService: any;
  scope: {
    clientIds: string[];
    clientHoldedContactIds: string[];
  };
  permissions: {
    canViewGlobal: boolean;
  };
}) {
  const { supaService, scope, permissions } = args;

  const clients = await loadScopedClients({
    supaService,
    scope,
    permissions,
  });

  const holdedContactIds = uniq(clients.map((c: any) => c.holded_contact_id));
  const clientIds = uniq(clients.map((c: any) => c.id));

  const [assignments, openInvoices] = await Promise.all([
    loadAssignmentsForHoldedContacts(supaService, holdedContactIds),
    loadOpenInvoicesForClients(supaService, clientIds),
  ]);

  const actorIds = uniq(assignments.map((a: any) => a.actor_id));
  const actorsById = await loadActorsByIds(supaService, actorIds);

  const delegateByHolded = new Map<string, any>();
  const kolByHolded = new Map<string, any>();
  const coordinatorByHolded = new Map<string, any>();

  for (const row of assignments) {
    const holded = String(row.client_holded_contact_id ?? "").trim();
    if (!holded) continue;

    if (row.assignment_role === "delegate" && !delegateByHolded.has(holded)) {
      delegateByHolded.set(holded, row);
    }
    if (row.assignment_role === "kol" && !kolByHolded.has(holded)) {
      kolByHolded.set(holded, row);
    }
    if (
      row.assignment_role === "coordinator" &&
      !coordinatorByHolded.has(holded)
    ) {
      coordinatorByHolded.set(holded, row);
    }
  }

  const openInvoicesByClientId = new Map<string, any[]>();
  for (const row of openInvoices) {
    const clientId = String(row.client_id ?? "").trim();
    if (!clientId) continue;
    if (!openInvoicesByClientId.has(clientId)) {
      openInvoicesByClientId.set(clientId, []);
    }
    openInvoicesByClientId.get(clientId)!.push(row);
  }

  const items = clients.map((client: any) => {
    const holded = String(client.holded_contact_id ?? "").trim();
    const clientOpenInvoices = openInvoicesByClientId.get(String(client.id)) ?? [];

    const delegateAssignment = holded ? delegateByHolded.get(holded) ?? null : null;
    const kolAssignment = holded ? kolByHolded.get(holded) ?? null : null;
    const coordinatorAssignment = holded
      ? coordinatorByHolded.get(holded) ?? null
      : null;

    const delegateActor = delegateAssignment
      ? actorsById.get(String(delegateAssignment.actor_id)) ?? null
      : null;

    const kolActor = kolAssignment
      ? actorsById.get(String(kolAssignment.actor_id)) ?? null
      : null;

    const coordinatorActor = coordinatorAssignment
      ? actorsById.get(String(coordinatorAssignment.actor_id)) ?? null
      : null;

    const needsReview = clientOpenInvoices.some(
      (row: any) => row.needs_review === true,
    );

    const pendingAmount = clientOpenInvoices.reduce(
      (acc: number, row: any) => acc + Number(row.total_net ?? 0),
      0,
    );

    return {
      id: String(client.id),
      name: client.name ?? null,
      holded_contact_id: client.holded_contact_id ?? null,
      contact_email: client.contact_email ?? null,
      delegate_name: delegateActor?.name ?? delegateActor?.email ?? null,
      kol_name: kolActor?.name ?? kolActor?.email ?? null,
      coordinator_name:
        coordinatorActor?.name ?? coordinatorActor?.email ?? null,
      open_invoices_count: clientOpenInvoices.length,
      pending_amount: Number(pendingAmount.toFixed(2)),
      needs_review: needsReview,
      orphan_client: !delegateAssignment,
    };
  });

  const clientsWithReview = items.filter((item) => item.needs_review);
  const orphanClients = items.filter((item) => item.orphan_client);
  const clientsWithOpenInvoices = items.filter((item) => item.open_invoices_count > 0);

  const summary = {
    total_clients: items.length,
    with_open_invoices: clientsWithOpenInvoices.length,
    orphan_clients: orphanClients.length,
    needs_review: clientsWithReview.length,
  };

  const finalItems = [...items]
    .sort((a, b) => {
      if (Number(b.needs_review) !== Number(a.needs_review)) {
        return Number(b.needs_review) - Number(a.needs_review);
      }
      if (b.open_invoices_count !== a.open_invoices_count) {
        return b.open_invoices_count - a.open_invoices_count;
      }
      return b.pending_amount - a.pending_amount;
    })
    .slice(0, 25);

  return {
    summary,
    items: finalItems,
    meta: {
      generated_at: new Date().toISOString(),
      source: permissions.canViewGlobal
        ? "clients.global"
        : scope.clientIds.length > 0
          ? "clients.scope.client_id"
          : scope.clientHoldedContactIds.length > 0
            ? "clients.scope.holded_contact_id"
            : "clients.scope.empty",
      loaded_clients: clients.length,
      loaded_open_invoices: openInvoices.length,
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
        error: "No autorizado (control_room.clients-monitor.read)",
      });
    }

    stage = "build_clients_monitor";
    const result = await buildClientsMonitor({
      supaService: ctx.supaService,
      scope: {
        clientIds: ctx.scope.clientIds,
        clientHoldedContactIds: ctx.scope.clientHoldedContactIds,
      },
      permissions: {
        canViewGlobal: ctx.permissions.canViewGlobal,
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