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

  const [{ data: actors }, { data: actorRoles }] = await Promise.all([
    supa.from("actors").select("id, name, email, role, status, company, department, commission_level").order("name"),
    supa.from("actor_roles").select("actor_id, role_code, is_primary, state_code"),
  ]);

  const rolesByActor = new Map<string, string[]>();
  for (const r of (actorRoles ?? []) as any[]) {
    if (r.state_code === "INACTIVE") continue;
    const arr = rolesByActor.get(r.actor_id) ?? [];
    if (r.role_code) arr.push(r.role_code);
    rolesByActor.set(r.actor_id, arr);
  }

  const enriched = ((actors ?? []) as any[]).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    status: a.status,
    company: a.company,
    department: a.department,
    commission_level: a.commission_level,
    roles: rolesByActor.get(a.id) ?? [],
  }));

  return json(200, { ok: true, actors: enriched });
}
