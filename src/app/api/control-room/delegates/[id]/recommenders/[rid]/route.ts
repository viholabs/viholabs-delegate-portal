// PATCH  /api/control-room/delegates/[id]/recommenders/[rid]  → actualizar recomendador
// DELETE /api/control-room/delegates/[id]/recommenders/[rid]  → eliminar recomendador
// GET    /api/control-room/delegates/[id]/recommenders/[rid]/clients managed in /clients sub-route

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeRole } from "@/lib/auth/roles";
import { asString, asNumber } from "@/lib/holded/holdedPrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function toActorLike(record: unknown) {
  const row = record as Record<string, unknown> | null | undefined;
  const id = asString(row?.id);
  if (!id) return null;
  return { id, role: asString(row?.role) };
}

function isSupervisor(role: string) {
  return ["MELQUISEDEC", "SUPER_ADMIN", "ADMINISTRATIVE", "COORDINATOR_COMMERCIAL", "COORDINATOR_CECT", "KOL"].includes(role);
}

// ---------------------------------------------------------------------------
// PATCH — update recommender fields
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; rid: string }> }
) {
  try {
    const { id: delegateId, rid } = await ctx.params;

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean; status?: number; error?: string; actor?: unknown;
    };
    if (!auth?.ok) return json(auth?.status ?? 401, { ok: false, error: auth?.error ?? "Unauthorized" });

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) return json(401, { ok: false, error: "Actor not resolved" });

    const role = normalizeRole(requestingActor.role);
    if (!isSupervisor(role)) {
      return json(403, { ok: false, error: "Solo supervisores pueden modificar recomendadores" });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json(400, { ok: false, error: "Body requerido" });

    const db = supabaseAdmin();

    // Verify recommender belongs to the delegate
    const { data: existing } = await db
      .from("recommenders")
      .select("id")
      .eq("id", rid)
      .eq("delegate_actor_id", delegateId)
      .eq("state_code", "OPEN")
      .maybeSingle();

    if (!existing) return json(404, { ok: false, error: "Recomendador no encontrado" });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return json(400, { ok: false, error: "name no puede estar vacío" });
      patch.name = name;
    }
    if ("email" in body) patch.email = asString(body.email)?.trim() || null;
    if ("phone" in body) patch.phone = asString(body.phone)?.trim() || null;
    if ("notes" in body) patch.notes = asString(body.notes)?.trim() || null;
    if ("client_id" in body) patch.client_id = asString(body.client_id) || null;
    if ("active" in body) patch.active = body.active !== false;
    if ("commission_pct" in body) {
      const pct = asNumber(body.commission_pct);
      if (pct === null || pct < 0 || pct > 100) {
        return json(400, { ok: false, error: "commission_pct debe ser entre 0 y 100" });
      }
      patch.commission_pct = pct;
    }

    const { data: updated, error: updateErr } = await db
      .from("recommenders")
      .update(patch)
      .eq("id", rid)
      .select()
      .single();

    if (updateErr) return json(500, { ok: false, error: updateErr.message });

    return json(200, { ok: true, recommender: updated });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete (state_code = CLOSED) or hard-delete (Melquisedec only)
// ---------------------------------------------------------------------------

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; rid: string }> }
) {
  try {
    const { id: delegateId, rid } = await ctx.params;

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean; status?: number; error?: string; actor?: unknown;
    };
    if (!auth?.ok) return json(auth?.status ?? 401, { ok: false, error: auth?.error ?? "Unauthorized" });

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) return json(401, { ok: false, error: "Actor not resolved" });

    const role = normalizeRole(requestingActor.role);
    if (!["MELQUISEDEC", "SUPER_ADMIN"].includes(role)) {
      return json(403, { ok: false, error: "Solo Melquisedec/Super_admin pueden eliminar recomendadores" });
    }

    const db = supabaseAdmin();

    const { data: existing } = await db
      .from("recommenders")
      .select("id")
      .eq("id", rid)
      .eq("delegate_actor_id", delegateId)
      .maybeSingle();

    if (!existing) return json(404, { ok: false, error: "Recomendador no encontrado" });

    // Soft-delete
    const { error: updateErr } = await db
      .from("recommenders")
      .update({ state_code: "CLOSED", updated_at: new Date().toISOString() })
      .eq("id", rid);

    if (updateErr) return json(500, { ok: false, error: updateErr.message });

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}
