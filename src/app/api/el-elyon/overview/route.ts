import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function GET(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const supa = ctx.supaService;

  const [
    { data: actors },
    { data: actorRoles },
    { data: recommenders },
    { data: recommenderLinks },
    { data: commissionAgents },
    { data: affiliates },
    { data: invoiceStats },
    { data: unpaidInvoices },
    { data: shopifyOrders },
    { data: warnings },
    { data: auditLog },
    { data: liquidations },
  ] = await Promise.all([
    supa.from("actors").select("id, name, role, status, email").order("name"),
    supa.from("actor_roles").select("actor_id, role_code, is_primary, state_code"),
    supa.from("recommender_profiles").select("id, status, commission_rate, recommender_client_id"),
    supa.from("recommender_client_links").select("id, recommender_profile_id, status"),
    supa.from("actors").select("id, name, role, status, email").eq("role", "COMMISSION_AGENT"),
    supa.from("affiliate_accounts").select("id, name, state_code"),
    supa
      .from("invoices")
      .select("id, total_net, is_paid, paid_date")
      .not("total_net", "is", null),
    supa
      .from("invoices")
      .select("id, total_net, due_date")
      .eq("is_paid", false)
      .not("total_net", "is", null),
    supa.from("shopify_orders_raw").select("id").limit(1),
    supa.from("system_error_events").select("id, severity").eq("resolved", false).limit(50),
    supa.from("el_elyon_audit_log").select("id, action, entity_type, created_at").order("created_at", { ascending: false }).limit(10),
    supa.from("affiliate_liquidations").select("id, state_code, amount"),
  ]);

  const actorList = (actors ?? []) as any[];
  const roleList = (actorRoles ?? []) as any[];
  const invList = (invoiceStats ?? []) as any[];
  const unpaidList = (unpaidInvoices ?? []) as any[];

  const activeActors = actorList.filter((a) => a.status === "active").length;
  const actorsWithRoles = new Set(roleList.filter((r) => r.state_code !== "INACTIVE").map((r) => r.actor_id)).size;
  const actorsWithoutRole = actorList.filter(
    (a) => !roleList.find((r) => r.actor_id === a.id && r.state_code !== "INACTIVE")
  ).length;

  const totalInvoiced = invList.reduce((s, i) => s + (Number(i.total_net) || 0), 0);
  const totalPaid = invList.filter((i) => i.is_paid).reduce((s, i) => s + (Number(i.total_net) || 0), 0);
  const totalUnpaid = unpaidList.reduce((s, i) => s + (Number(i.total_net) || 0), 0);

  const now = new Date();
  const overdueInvoices = unpaidList.filter((i) => {
    if (!i.due_date) return false;
    return new Date(i.due_date) < now;
  }).length;

  const criticalWarnings = ((warnings ?? []) as any[]).filter((w) => w.severity === "critical").length;

  const pendingLiquidations = ((liquidations ?? []) as any[]).filter((l) => l.state_code === "PENDING").length;

  return json(200, {
    ok: true,
    kpis: {
      actors: { total: actorList.length, active: activeActors, with_roles: actorsWithRoles, without_role: actorsWithoutRole },
      recommenders: {
        total: (recommenders ?? []).length,
        active: ((recommenders ?? []) as any[]).filter((r) => r.status === "active").length,
        client_links: (recommenderLinks ?? []).length,
      },
      commission_agents: {
        total: (commissionAgents ?? []).length,
        active: ((commissionAgents ?? []) as any[]).filter((a) => a.status === "active").length,
      },
      affiliates: {
        total: (affiliates ?? []).length,
        active: ((affiliates ?? []) as any[]).filter((a) => a.state_code === "OPEN").length,
      },
      invoices: {
        total: invList.length,
        total_invoiced: Math.round(totalInvoiced * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        total_unpaid: Math.round(totalUnpaid * 100) / 100,
        overdue: overdueInvoices,
      },
      shopify: { configured: (shopifyOrders ?? []).length > 0, order_count: (shopifyOrders ?? []).length },
      warnings: { critical: criticalWarnings, total: (warnings ?? []).length },
      liquidations: { pending: pendingLiquidations, total: (liquidations ?? []).length },
    },
    recent_audit: (auditLog ?? []).slice(0, 5),
    global_status: criticalWarnings > 0 ? "critical" : overdueInvoices > 5 ? "warning" : "ok",
  });
}
