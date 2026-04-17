// src/app/api/control-room/delegates/[id]/commission-rules/route.ts
// PATCH /api/control-room/delegates/[id]/commission-rules
// Actualiza una regla de comisión existente. Solo Melquisedec.

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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await ctx.params; // delegateId available but not needed beyond auth

    const auth = (await getActorFromRequest(req)) as {
      ok?: boolean;
      status?: number;
      error?: string;
      actor?: unknown;
    };

    if (!auth?.ok) {
      return json(auth?.status ?? 401, { ok: false, error: auth?.error ?? "Unauthorized" });
    }

    const requestingActor = toActorLike(auth.actor);
    if (!requestingActor) return json(401, { ok: false, error: "Actor not resolved" });

    if (normalizeRole(requestingActor.role) !== "MELQUISEDEC") {
      return json(403, { ok: false, error: "Solo Melquisedec puede modificar reglas de comisión" });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json(400, { ok: false, error: "Cuerpo inválido" });

    const ruleId = asString(body.id);
    if (!ruleId) return json(400, { ok: false, error: "id de regla requerido" });

    // Whitelist de campos editables
    const patch: Record<string, unknown> = {};
    const allowed = ["percentage", "reference_price", "from_units", "to_units", "valid_from", "valid_to", "active", "channel", "year"] as const;
    for (const key of allowed) {
      if (key in body) patch[key] = body[key] ?? null;
    }

    if (Object.keys(patch).length === 0) {
      return json(400, { ok: false, error: "Sin campos para actualizar" });
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("commission_rules_delegates")
      .update(patch)
      .eq("id", ruleId)
      .select()
      .single();

    if (error) return json(500, { ok: false, error: error.message });
    if (!data) return json(404, { ok: false, error: "Regla no encontrada" });

    return json(200, { ok: true, rule: data });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}
