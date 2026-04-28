// GET    /api/control-room/delegates/[id]/recommenders/[rid]/clients  → clientes asignados al recomendador
// POST   /api/control-room/delegates/[id]/recommenders/[rid]/clients  → asignar cliente
// DELETE /api/control-room/delegates/[id]/recommenders/[rid]/clients?client_id=X → desasignar

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

async function verifyRecommenderOwnership(db: ReturnType<typeof supabaseAdmin>, rid: string, delegateId: string) {
  const { data } = await db
    .from("recommenders")
    .select("id, commission_pct")
    .eq("id", rid)
    .eq("delegate_actor_id", delegateId)
    .eq("state_code", "OPEN")
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// GET — list clients assigned to a recommender
// ---------------------------------------------------------------------------

export async function GET(
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
    const db = supabaseAdmin();

    const recommender = await verifyRecommenderOwnership(db, rid, delegateId);
    if (!recommender) return json(404, { ok: false, error: "Recomendador no encontrado" });

    // Delegates can see their own recommenders' data
    if (role === "DELEGATE" && requestingActor.id !== delegateId) {
      return json(403, { ok: false, error: "Forbidden" });
    }

    const { data: assignments, error: assErr } = await db
      .from("recommender_client_assignments")
      .select("id, client_id, commission_pct, valid_from, valid_to, created_at")
      .eq("recommender_id", rid)
      .eq("state_code", "OPEN")
      .order("valid_from", { ascending: false });

    if (assErr) return json(500, { ok: false, error: assErr.message });

    // Enrich with client names
    const clientIds = (assignments ?? [])
      .map((r) => asString((r as Record<string, unknown>).client_id))
      .filter((v): v is string => !!v);

    const clientNameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await db
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      for (const c of clients ?? []) {
        const r = c as Record<string, unknown>;
        const cid = asString(r.id);
        if (cid) clientNameMap.set(cid, asString(r.name) ?? "—");
      }
    }

    const result = (assignments ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const cid = asString(r.client_id) ?? "";
      return {
        id: asString(r.id),
        client_id: cid,
        client_name: clientNameMap.get(cid) ?? "—",
        commission_pct: asNumber(r.commission_pct) ?? null,
        valid_from: asString(r.valid_from),
        valid_to: asString(r.valid_to),
        created_at: asString(r.created_at),
      };
    });

    return json(200, { ok: true, clients: result });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}

// ---------------------------------------------------------------------------
// POST — assign a client to a recommender
// ---------------------------------------------------------------------------

export async function POST(
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
      return json(403, { ok: false, error: "Solo supervisores pueden asignar clientes" });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const clientId = asString(body?.client_id);
    if (!clientId) return json(400, { ok: false, error: "client_id requerido" });

    const db = supabaseAdmin();

    const recommender = await verifyRecommenderOwnership(db, rid, delegateId);
    if (!recommender) return json(404, { ok: false, error: "Recomendador no encontrado" });

    // Verify client exists
    const { data: client } = await db.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (!client) return json(404, { ok: false, error: "Cliente no encontrado" });

    const { data: assignment, error: insertErr } = await db
      .from("recommender_client_assignments")
      .upsert(
        {
          recommender_id: rid,
          client_id: clientId,
          commission_pct: asNumber(body?.commission_pct) ?? null,
          valid_from: asString(body?.valid_from) || new Date().toISOString().slice(0, 10),
          valid_to: asString(body?.valid_to) || null,
          state_code: "OPEN",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "recommender_id,client_id" }
      )
      .select()
      .single();

    if (insertErr) return json(500, { ok: false, error: insertErr.message });

    return json(201, { ok: true, assignment });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove client assignment
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
    if (!isSupervisor(role)) {
      return json(403, { ok: false, error: "Solo supervisores pueden desasignar clientes" });
    }

    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id");
    if (!clientId) return json(400, { ok: false, error: "client_id requerido como query param" });

    const db = supabaseAdmin();

    const recommender = await verifyRecommenderOwnership(db, rid, delegateId);
    if (!recommender) return json(404, { ok: false, error: "Recomendador no encontrado" });

    const { error: updateErr } = await db
      .from("recommender_client_assignments")
      .update({ state_code: "CLOSED", updated_at: new Date().toISOString() })
      .eq("recommender_id", rid)
      .eq("client_id", clientId);

    if (updateErr) return json(500, { ok: false, error: updateErr.message });

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Error inesperado" });
  }
}
