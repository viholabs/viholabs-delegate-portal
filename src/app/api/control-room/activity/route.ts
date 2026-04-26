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

  const rawAll = [
    ...invoiceEvents,
    ...assignmentEvents,
    ...warningEvents,
  ].filter((e) => e.timestamp);

  const sorted = rawAll.sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp)),
  );

  // Normalize to the shape the ActivityTimelineBlock component expects
  function severityFromType(type: string, state: string | null): "info" | "warning" | "critical" {
    if (type === "technical_warning") return "warning";
    if (type === "invoice_needs_review") return "warning";
    if (state === "overdue" || state === "OVERDUE") return "critical";
    return "info";
  }

  function actionLabel(type: string): string {
    switch (type) {
      case "invoice_created": return "factura_creada";
      case "invoice_reviewed": return "factura_revisada";
      case "invoice_needs_review": return "pendiente_revision";
      case "assignment": return "asignacion";
      case "technical_warning": return "aviso_tecnico";
      default: return type;
    }
  }

  function entityType(type: string): string {
    if (type.startsWith("invoice")) return "factura";
    if (type === "assignment") return "asignacion";
    if (type === "technical_warning") return "tecnico";
    return "sistema";
  }

  const items = sorted.slice(0, 50).map((e: any, i: number) => ({
    id: e.entity_id ? `${e.type}_${e.entity_id}` : `${e.type}_${i}`,
    timestamp: e.timestamp,
    actor_name: "Sistema",
    action_type: actionLabel(e.type),
    entity_type: entityType(e.type),
    entity_label: e.label ?? null,
    message: e.label ?? null,
    severity: e.severity ?? severityFromType(e.type, e.state ?? null),
    amount: e.amount ?? null,
  }));

  return {
    items,
    summary: {
      total_events: rawAll.length,
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