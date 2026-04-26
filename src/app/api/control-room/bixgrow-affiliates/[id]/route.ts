import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const allowed = ["name", "email", "referral_code", "commission_value", "commission_type", "state_code", "affiliate_external_id"];
  const update: Record<string, unknown> = { synced_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) {
      if (key === "email") update[key] = body[key]?.trim()?.toLowerCase() || null;
      else if (key === "commission_value") update[key] = body[key] != null ? Number(body[key]) : null;
      else update[key] = typeof body[key] === "string" ? (body[key].trim() || null) : body[key];
    }
  }

  const supa = ctx.supaService;
  const { data, error } = await supa
    .from("affiliate_accounts")
    .update(update)
    .eq("id", id)
    .select("id, name, email, referral_code, commission_value, commission_type, state_code, affiliate_external_id, source, synced_at")
    .single();

  if (error) return json(500, { ok: false, error: error.message });
  return json(200, { ok: true, affiliate: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const { id } = await params;
  const supa = ctx.supaService;

  const { error } = await supa.from("affiliate_accounts").delete().eq("id", id);
  if (error) return json(500, { ok: false, error: error.message });
  return json(200, { ok: true });
}
