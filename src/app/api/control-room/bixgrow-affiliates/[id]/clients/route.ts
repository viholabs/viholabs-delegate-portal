import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// GET — list clients linked to this affiliate
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id } = await params;
  const supa = ctx.supaService;

  const { data: events, error } = await supa
    .from("affiliate_attribution_events")
    .select("id, client_id, source, event_at, commission_amount, order_amount, state_code")
    .eq("affiliate_account_id", id)
    .not("client_id", "is", null)
    .order("event_at", { ascending: false });

  if (error) return json(500, { ok: false, error: error.message });

  const clientIds = [...new Set((events ?? []).map((e: any) => e.client_id).filter(Boolean))] as string[];
  const { data: clients } = clientIds.length > 0
    ? await supa.from("clients").select("id, name, contact_email, status").in("id", clientIds)
    : { data: [] };

  const clientById = new Map(((clients ?? []) as any[]).map((c) => [c.id, c]));

  const rows = (events ?? []).map((e: any) => ({
    event_id: e.id,
    client_id: e.client_id,
    client_name: clientById.get(e.client_id)?.name ?? null,
    client_email: clientById.get(e.client_id)?.contact_email ?? null,
    client_status: clientById.get(e.client_id)?.status ?? null,
    source: e.source,
    event_at: e.event_at,
    commission_amount: e.commission_amount,
    order_amount: e.order_amount,
    state_code: e.state_code,
    removable: ["manual", "manual_control_room", "email_match", "bixgrow_sync"].includes(e.source),
  }));

  return json(200, { ok: true, clients: rows });
}

// POST — link a client to this affiliate
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id: affiliateId } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const { client_id, commission_amount, order_amount } = body;
  if (!client_id) return json(400, { ok: false, error: "client_id requerido" });

  const supa = ctx.supaService;

  // Verify affiliate exists
  const { data: aff } = await supa.from("affiliate_accounts").select("id, email").eq("id", affiliateId).maybeSingle();
  if (!aff) return json(404, { ok: false, error: "Afiliado no encontrado" });

  // Verify client exists
  const { data: client } = await supa.from("clients").select("id, contact_email").eq("id", client_id).maybeSingle();
  if (!client) return json(404, { ok: false, error: "Cliente no encontrado" });

  // Check if already linked with a manual source
  const { data: existing } = await supa
    .from("affiliate_attribution_events")
    .select("id")
    .eq("affiliate_account_id", affiliateId)
    .eq("client_id", client_id)
    .in("source", ["manual", "manual_control_room", "email_match"])
    .limit(1);

  if (existing?.length) return json(409, { ok: false, error: "Ya está vinculado" });

  const eventHash = crypto.createHash("md5").update(`manual_${affiliateId}_${client_id}_${Date.now()}`).digest("hex");

  const { data, error } = await supa
    .from("affiliate_attribution_events")
    .insert({
      affiliate_account_id: affiliateId,
      client_id,
      source: "manual",
      source_event_id: "MANUAL_LINK",
      event_hash: eventHash,
      event_at: new Date().toISOString(),
      state_code: "OPEN",
      customer_email: client.contact_email ?? aff.email ?? null,
      commission_amount: commission_amount != null ? Number(commission_amount) : null,
      order_amount: order_amount != null ? Number(order_amount) : null,
    })
    .select("id, client_id, source, event_at")
    .single();

  if (error) return json(500, { ok: false, error: error.message });
  return json(201, { ok: true, event: data });
}

// DELETE — unlink a client (removes manual/email_match events, not webhook conversions)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id: affiliateId } = await params;
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) return json(400, { ok: false, error: "client_id requerido como query param" });

  const supa = ctx.supaService;
  const { error } = await supa
    .from("affiliate_attribution_events")
    .delete()
    .eq("affiliate_account_id", affiliateId)
    .eq("client_id", clientId)
    .in("source", ["manual", "manual_control_room", "email_match", "bixgrow_sync"]);

  if (error) return json(500, { ok: false, error: error.message });
  return json(200, { ok: true });
}
