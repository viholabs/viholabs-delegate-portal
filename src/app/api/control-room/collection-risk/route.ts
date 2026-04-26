import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function todayDateOnly() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function diffDays(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00Z`);
  const b = new Date(`${dateB}T00:00:00Z`);
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

export async function GET(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewFinance && !ctx.permissions.canViewGlobal) {
    return json(403, { ok: false, error: "No autorizado" });
  }

  const supa = ctx.supaService;
  const today = todayDateOnly();

  let query = supa
    .from("invoices")
    .select("id, invoice_number, client_id, client_name, delegate_id, ops_owner_actor_id, invoice_date, total_net, currency, is_paid, state_code")
    .or("is_paid.is.false,is_paid.is.null")
    .order("invoice_date", { ascending: true })
    .limit(1000);

  if (ctx.permissions.canViewGlobal) {
    // global — no filter
  } else if (ctx.scope.clientIds.length > 0) {
    query = query.in("client_id", ctx.scope.clientIds);
  } else if (ctx.scope.delegateIds.length > 0) {
    query = query.in("delegate_id", ctx.scope.delegateIds);
  }

  const { data: invoices, error } = await query;
  if (error) return json(500, { ok: false, error: error.message });

  const rows = (invoices ?? []) as any[];
  if (rows.length === 0) {
    return json(200, {
      ok: true,
      summary: { total_at_risk: 0, overdue_15_amount: 0, overdue_30_amount: 0, risky_clients_count: 0, risky_delegates_count: 0 },
      top_clients: [],
      top_delegates: [],
      aging_buckets: [
        { label: "0–7 días", count: 0, amount: 0 },
        { label: "8–15 días", count: 0, amount: 0 },
        { label: "16–30 días", count: 0, amount: 0 },
        { label: "+30 días", count: 0, amount: 0 },
      ],
    });
  }

  // Build aging buckets
  const buckets = [
    { label: "0–7 días", minDays: 0, maxDays: 7, count: 0, amount: 0 },
    { label: "8–15 días", minDays: 8, maxDays: 15, count: 0, amount: 0 },
    { label: "16–30 días", minDays: 16, maxDays: 30, count: 0, amount: 0 },
    { label: "+30 días", minDays: 31, maxDays: Infinity, count: 0, amount: 0 },
  ];

  const clientRisk = new Map<string, { name: string | null; amount: number }>();
  const delegateRisk = new Map<string, { name: string | null; amount: number }>();

  let totalAtRisk = 0;
  let overdue15 = 0;
  let overdue30 = 0;

  for (const row of rows) {
    const issueDate = String(row.invoice_date ?? "").trim();
    if (!issueDate) continue;

    const days = diffDays(today, issueDate);
    const amount = toNum(row.total_net, 0);
    totalAtRisk += amount;

    if (days > 15) overdue15 += amount;
    if (days > 30) overdue30 += amount;

    // Assign to bucket
    for (const b of buckets) {
      if (days >= b.minDays && days <= b.maxDays) {
        b.count++;
        b.amount += amount;
        break;
      }
    }

    // Client aggregation
    const cid = row.client_id ?? row.client_name ?? "unknown";
    const existing = clientRisk.get(cid);
    if (existing) {
      existing.amount += amount;
    } else {
      clientRisk.set(cid, { name: row.client_name ?? null, amount });
    }

    // Delegate aggregation
    const did = row.delegate_id ?? row.ops_owner_actor_id ?? "unknown";
    const existingD = delegateRisk.get(did);
    if (existingD) {
      existingD.amount += amount;
    } else {
      delegateRisk.set(did, { name: null, amount });
    }
  }

  // Load delegate names
  const delegateIds = [...delegateRisk.keys()].filter((d) => d !== "unknown");
  if (delegateIds.length > 0) {
    const { data: actors } = await supa
      .from("actors")
      .select("id, name")
      .in("id", delegateIds);
    for (const actor of actors ?? []) {
      const entry = delegateRisk.get(actor.id);
      if (entry) entry.name = actor.name ?? null;
    }
  }

  const topClients = [...clientRisk.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 5)
    .map(([client_id, v]) => ({ client_id, client_name: v.name, amount: Number(v.amount.toFixed(2)) }));

  const topDelegates = [...delegateRisk.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 5)
    .map(([delegate_id, v]) => ({ delegate_id, delegate_name: v.name, amount: Number(v.amount.toFixed(2)) }));

  return json(200, {
    ok: true,
    summary: {
      total_at_risk: Number(totalAtRisk.toFixed(2)),
      overdue_15_amount: Number(overdue15.toFixed(2)),
      overdue_30_amount: Number(overdue30.toFixed(2)),
      risky_clients_count: clientRisk.size,
      risky_delegates_count: delegateRisk.size,
    },
    top_clients: topClients,
    top_delegates: topDelegates,
    aging_buckets: buckets.map((b) => ({
      label: b.label,
      count: b.count,
      amount: Number(b.amount.toFixed(2)),
    })),
  });
}
