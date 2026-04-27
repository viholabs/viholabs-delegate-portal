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

  const [{ data: agents }, { data: extensions }, { data: clientLinks }, { data: levels }, { data: commRules }] =
    await Promise.all([
      supa.from("actors").select("id, name, email, status, role, company").eq("role", "COMMISSION_AGENT").order("name"),
      supa.from("commission_agent_extensions").select("actor_id, agent_type, country, currency, valid_from, valid_to"),
      supa.from("commission_agent_client_links").select("commission_agent_id, client_id, status").eq("status", "active"),
      supa.from("commission_agent_level_structures").select("commission_agent_id, client_id, level, commission_rate, status").eq("status", "active"),
      supa.from("commission_rules_recommenders").select("recommender_id, channel, percentage, active").eq("active", true),
    ]);

  const agentList = (agents ?? []) as any[];
  const extMap = new Map(((extensions ?? []) as any[]).map((e) => [e.actor_id, e]));
  const linksByAgent = new Map<string, number>();
  for (const l of (clientLinks ?? []) as any[]) {
    linksByAgent.set(l.commission_agent_id, (linksByAgent.get(l.commission_agent_id) ?? 0) + 1);
  }
  const levelsByAgent = new Map<string, any[]>();
  for (const l of (levels ?? []) as any[]) {
    const arr = levelsByAgent.get(l.commission_agent_id) ?? [];
    arr.push(l);
    levelsByAgent.set(l.commission_agent_id, arr);
  }
  const rulesByAgent = new Map<string, any[]>();
  for (const r of (commRules ?? []) as any[]) {
    if (!r.recommender_id) continue;
    const arr = rulesByAgent.get(r.recommender_id) ?? [];
    arr.push(r);
    rulesByAgent.set(r.recommender_id, arr);
  }

  const enriched = agentList.map((a) => {
    const ext = extMap.get(a.id);
    const rules = rulesByAgent.get(a.id) ?? [];
    const defaultRate = rules.find((r) => r.channel === "pdv")?.percentage ?? null;
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      status: a.status,
      company: a.company,
      agent_type: ext?.agent_type ?? "national",
      country: ext?.country ?? null,
      currency: ext?.currency ?? "EUR",
      active_client_links: linksByAgent.get(a.id) ?? 0,
      level_structures: levelsByAgent.get(a.id) ?? [],
      commission_rules: rules,
      default_commission_rate: defaultRate,
    };
  });

  return json(200, { ok: true, agents: enriched });
}
