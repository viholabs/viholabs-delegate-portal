import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id: agentId } = await params;
  const supa = ctx.supaService;

  const { data: structs, error } = await supa
    .from("commission_agent_level_structures")
    .select("id, client_id, level, commission_rate, status, valid_from, valid_to, notes")
    .eq("commission_agent_id", agentId)
    .order("level");

  if (error) return json(500, { ok: false, error: error.message });

  const clientIds = [...new Set(((structs ?? []) as any[]).map((s) => s.client_id).filter(Boolean))] as string[];
  const { data: clients } = clientIds.length > 0
    ? await supa.from("clients").select("id, name, contact_email").in("id", clientIds)
    : { data: [] };

  const clientMap = new Map(((clients ?? []) as any[]).map((c) => [c.id, c]));

  const enriched = ((structs ?? []) as any[]).map((s) => ({
    ...s,
    client_name: clientMap.get(s.client_id)?.name ?? null,
    client_email: clientMap.get(s.client_id)?.contact_email ?? null,
  }));

  return json(200, { ok: true, level_structures: enriched });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id: agentId } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const { client_id, level, commission_rate, valid_from, valid_to, notes } = body;
  if (!client_id) return json(400, { ok: false, error: "client_id requerido" });
  if (level == null || level < 1 || level > 5) return json(400, { ok: false, error: "level debe ser 1-5" });
  if (commission_rate == null || commission_rate < 0) return json(400, { ok: false, error: "commission_rate requerido (≥ 0)" });

  const supa = ctx.supaService;
  const actorId = (ctx as any).actor?.id ?? null;

  const { data, error } = await supa
    .from("commission_agent_level_structures")
    .insert({
      commission_agent_id: agentId,
      client_id,
      level: Number(level),
      commission_rate: Number(commission_rate),
      valid_from: valid_from || new Date().toISOString().slice(0, 10),
      valid_to: valid_to || null,
      notes: notes || null,
      status: "active",
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id, client_id, level, commission_rate, status")
    .single();

  if (error) {
    if (error.code === "23505") return json(409, { ok: false, error: "Ya existe una estructura para este cliente/nivel/fecha" });
    if (error.code === "23514") return json(400, { ok: false, error: "level debe ser 1-5 y commission_rate ≥ 0" });
    return json(500, { ok: false, error: error.message });
  }

  await supa.from("el_elyon_audit_log").insert({
    actor_id: actorId,
    action: "create_level_structure",
    entity_type: "commission_agent_level_structures",
    entity_id: data.id,
    after_value: { commission_agent_id: agentId, ...data },
  });

  return json(201, { ok: true, level_structure: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id: agentId } = await params;
  const url = new URL(req.url);
  const structureId = url.searchParams.get("structure_id");
  if (!structureId) return json(400, { ok: false, error: "structure_id requerido" });

  const supa = ctx.supaService;
  const { error } = await supa
    .from("commission_agent_level_structures")
    .delete()
    .eq("id", structureId)
    .eq("commission_agent_id", agentId);

  if (error) return json(500, { ok: false, error: error.message });
  return json(200, { ok: true });
}
