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

  const { data: profiles, error } = await supa
    .from("recommender_profiles")
    .select("id, recommender_client_id, responsible_delegate_actor_id, commission_rate, status, valid_from, valid_to, notes, created_at")
    .order("created_at", { ascending: false });

  if (error) return json(500, { ok: false, error: error.message });

  const profileList = (profiles ?? []) as any[];
  const clientIds = [...new Set(profileList.map((p) => p.recommender_client_id).filter(Boolean))] as string[];
  const actorIds = [...new Set(profileList.map((p) => p.responsible_delegate_actor_id).filter(Boolean))] as string[];

  const [{ data: clients }, { data: delegateActors }, { data: links }] = await Promise.all([
    clientIds.length > 0
      ? supa.from("clients").select("id, name, contact_email").in("id", clientIds)
      : Promise.resolve({ data: [] }),
    actorIds.length > 0
      ? supa.from("actors").select("id, name, email").in("id", actorIds)
      : Promise.resolve({ data: [] }),
    supa.from("recommender_client_links").select("recommender_profile_id, status").in(
      "recommender_profile_id",
      profileList.map((p) => p.id)
    ),
  ]);

  const clientMap = new Map(((clients ?? []) as any[]).map((c) => [c.id, c]));
  const actorMap = new Map(((delegateActors ?? []) as any[]).map((a) => [a.id, a]));
  const linkCount = new Map<string, number>();
  for (const l of (links ?? []) as any[]) {
    if (l.status === "active") linkCount.set(l.recommender_profile_id, (linkCount.get(l.recommender_profile_id) ?? 0) + 1);
  }

  const enriched = profileList.map((p) => ({
    ...p,
    recommender_client_name: clientMap.get(p.recommender_client_id)?.name ?? null,
    recommender_client_email: clientMap.get(p.recommender_client_id)?.contact_email ?? null,
    delegate_name: actorMap.get(p.responsible_delegate_actor_id)?.name ?? null,
    active_client_links: linkCount.get(p.id) ?? 0,
  }));

  return json(200, { ok: true, recommenders: enriched });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const { recommender_client_id, responsible_delegate_actor_id, commission_rate, valid_from, valid_to, notes } = body;
  if (!recommender_client_id) return json(400, { ok: false, error: "recommender_client_id requerido" });
  if (commission_rate == null) return json(400, { ok: false, error: "commission_rate requerido" });

  const supa = ctx.supaService;
  const actorId = (ctx as any).actor?.id ?? null;

  const { data, error } = await supa
    .from("recommender_profiles")
    .insert({
      recommender_client_id,
      responsible_delegate_actor_id: responsible_delegate_actor_id || null,
      commission_rate: Number(commission_rate),
      valid_from: valid_from || new Date().toISOString().slice(0, 10),
      valid_to: valid_to || null,
      notes: notes || null,
      status: "active",
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id, recommender_client_id, commission_rate, status")
    .single();

  if (error) return json(500, { ok: false, error: error.message });

  await supa.from("el_elyon_audit_log").insert({
    actor_id: actorId,
    action: "create_recommender",
    entity_type: "recommender_profile",
    entity_id: data.id,
    after_value: data,
  });

  return json(201, { ok: true, recommender: data });
}
