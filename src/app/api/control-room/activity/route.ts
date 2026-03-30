// src/app/api/control-room/activity/route.ts

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

function toISO(v: any): string | null {
  if (!v) return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

function uniq(arr: any[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

async function loadInvoicesActivity(args: {
  supaService: any;
  scope: any;
  permissions: any;
}) {
  const { supaService, scope, permissions } = args;

  let query = supaService
    .from("invoices")
    .select(
      "id, invoice_number, client_id, total_net, created_at, reviewed_at, needs_review, state_code",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (permissions.canViewGlobal) {
    // no filter
  } else if (scope.clientIds.length > 0) {
    query = query.in("client_id", scope.clientIds);
  }

  const { data } = await query;

  const rows = Array.isArray(data) ? data : [];

  const events: any[] = [];

  for (const row of rows) {
    if (row.created_at) {
      events.push({
        type: "invoice_created",
        timestamp: toISO(row.created_at),
        entity_id: row.id,
        label: `Factura ${row.invoice_number ?? "—"} creada`,
        amount: row.total_net ?? 0,
        state: row.state_code ?? null,
      });
    }

    if (row.reviewed_at) {
      events.push({
        type: "invoice_reviewed",
        timestamp: toISO(row.reviewed_at),
        entity_id: row.id,
        label: `Factura ${row.invoice_number ?? "—"} revisada`,
        state: row.state_code ?? null,
      });
    }

    if (row.needs_review === true) {
      events.push({
        type: "invoice_needs_review",
        timestamp: toISO(row.created_at),
        entity_id: row.id,
        label: `Factura pendiente de revisión`,
        state: row.state_code ?? null,
      });
    }
  }

  return events;
}

async function loadAssignmentsActivity(args: {
  supaService: any;
  scope: any;
}) {
  const { supaService, scope } = args;

  let query = supaService
    .from("client_actor_assignments_g1")
    .select(
      "actor_id, assignment_role, client_holded_contact_id, created_at, source",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (scope.clientHoldedContactIds.length > 0) {
    query = query.in(
      "client_holded_contact_id",
      scope.clientHoldedContactIds,
    );
  }

  const { data } = await query;

  const rows = Array.isArray(data) ? data : [];

  return rows.map((row: any) => ({
    type: "assignment",
    timestamp: toISO(row.created_at),
    entity_id: row.client_holded_contact_id,
    label: `Asignación ${row.assignment_role}`,
    meta: {
      actor_id: row.actor_id,
      source: row.source,
    },
  }));
}

async function loadTechnicalWarnings(args: {
  supaService: any;
}) {
  try {
    const { data } = await args.supaService
      .from("technical_warnings")
      .select("id, message, created_at, severity")
      .order("created_at", { ascending: false })
      .limit(50);

    const rows = Array.isArray(data) ? data : [];

    return rows.map((row: any) => ({
      type: "technical_warning",
      timestamp: toISO(row.created_at),
      entity_id: row.id,
      label: row.message ?? "Warning técnico",
      severity: row.severity ?? "unknown",
    }));
  } catch {
    return [];
  }
}

async function buildActivity(args: {
  supaService: any;
  scope: any;
  permissions: any;
}) {
  const { supaService, scope, permissions } = args;

  const [invoiceEvents, assignmentEvents, warningEvents] =
    await Promise.all([
      loadInvoicesActivity({ supaService, scope, permissions }),
      loadAssignmentsActivity({ supaService, scope }),
      loadTechnicalWarnings({ supaService }),
    ]);

  const all = [
    ...invoiceEvents,
    ...assignmentEvents,
    ...warningEvents,
  ].filter((e) => e.timestamp);

  const sorted = all.sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp)),
  );

  return {
    items: sorted.slice(0, 50),
    summary: {
      total_events: all.length,
      invoices: invoiceEvents.length,
      assignments: assignmentEvents.length,
      warnings: warningEvents.length,
    },
    meta: {
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

    if (!ctx.permissions.canViewGlobal && !ctx.permissions.canViewFinance) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const result = await buildActivity({
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