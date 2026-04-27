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

  const { id } = await params;
  const supa = ctx.supaService;

  const { data: links, error } = await supa
    .from("recommender_client_links")
    .select("id, recommended_client_id, responsible_delegate_actor_id, status, valid_from, valid_to, notes, created_at")
    .eq("recommender_profile_id", id)
    .order("created_at", { ascending: false });

  if (error) return json(500, { ok: false, error: error.message });

  const linkList = (links ?? []) as any[];
  const clientIds = [...new Set(linkList.map((l) => l.recommended_client_id).filter(Boolean))] as string[];
  const actorIds = [...new Set(linkList.map((l) => l.responsible_delegate_actor_id).filter(Boolean))] as string[];

  const [{ data: clients }, { data: actors }] = await Promise.all([
    clientIds.length > 0
      ? supa.from("clients").select("id, name, contact_email, status").in("id", clientIds)
      : Promise.resolve({ data: [] }),
    actorIds.length > 0
      ? supa.from("actors").select("id, name").in("id", actorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const clientMap = new Map(((clients ?? []) as any[]).map((c) => [c.id, c]));
  const actorMap = new Map(((actors ?? []) as any[]).map((a) => [a.id, a]));

  // For each linked client, get invoice totals
  const { data: invoiceTotals } = clientIds.length > 0
    ? await supa.from("invoices").select("client_id, total_net, is_paid").in("client_id", clientIds).not("total_net", "is", null)
    : { data: [] };

  const invByClient = new Map<string, { total: number; paid: number }>();
  for (const inv of (invoiceTotals ?? []) as any[]) {
    const ex = invByClient.get(inv.client_id) ?? { total: 0, paid: 0 };
    const net = Number(inv.total_net) || 0;
    ex.total += net;
    if (inv.is_paid) ex.paid += net;
    invByClient.set(inv.client_id, ex);
  }

  const enriched = linkList.map((l) => {
    const c = clientMap.get(l.recommended_client_id);
    const inv = invByClient.get(l.recommended_client_id);
    return {
      ...l,
      client_name: c?.name ?? null,
      client_email: c?.contact_email ?? null,
      client_status: c?.status ?? null,
      delegate_name: actorMap.get(l.responsible_delegate_actor_id)?.name ?? null,
      invoice_total: inv ? Math.round(inv.total * 100) / 100 : null,
      invoice_paid_total: inv ? Math.round(inv.paid * 100) / 100 : null,
    };
  });

  return json(200, { ok: true, client_links: enriched });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id: recommenderProfileId } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const { recommended_client_id, responsible_delegate_actor_id, valid_from, valid_to, notes } = body;
  if (!recommended_client_id) return json(400, { ok: false, error: "recommended_client_id requerido" });

  const supa = ctx.supaService;
  const actorId = (ctx as any).actor?.id ?? null;

  const { data, error } = await supa
    .from("recommender_client_links")
    .insert({
      recommender_profile_id: recommenderProfileId,
      recommended_client_id,
      responsible_delegate_actor_id: responsible_delegate_actor_id || null,
      valid_from: valid_from || new Date().toISOString().slice(0, 10),
      valid_to: valid_to || null,
      notes: notes || null,
      status: "active",
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id, recommended_client_id, status")
    .single();

  if (error) {
    if (error.code === "23505") return json(409, { ok: false, error: "Este cliente ya está vinculado a este recomendador" });
    return json(500, { ok: false, error: error.message });
  }

  await supa.from("el_elyon_audit_log").insert({
    actor_id: actorId,
    action: "link_recommended_client",
    entity_type: "recommender_client_link",
    entity_id: data.id,
    after_value: { recommender_profile_id: recommenderProfileId, ...data },
  });

  return json(201, { ok: true, link: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id: recommenderProfileId } = await params;
  const url = new URL(req.url);
  const linkId = url.searchParams.get("link_id");
  if (!linkId) return json(400, { ok: false, error: "link_id requerido" });

  const supa = ctx.supaService;
  const { error } = await supa
    .from("recommender_client_links")
    .delete()
    .eq("id", linkId)
    .eq("recommender_profile_id", recommenderProfileId);

  if (error) return json(500, { ok: false, error: error.message });
  return json(200, { ok: true });
}
