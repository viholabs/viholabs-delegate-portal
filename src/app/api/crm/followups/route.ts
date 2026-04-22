// src/app/api/crm/followups/route.ts
// GET  ?delegateActorId=&clientId=&limit=&offset=
// POST { delegate_actor_id, client_id, type, note, next_action_at? }
//
// Los delegados son actors con role DELEGATE/KOL/etc — no existe tabla 'delegates'.
// delegate_actor_id = actors.id del actor que gestiona el cliente.

import { getActorFromRequest, json } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["call", "whatsapp", "email", "visit", "incident", "note"] as const;
type FollowUpType = (typeof ALLOWED_TYPES)[number];

function isSupervisorRole(role: string | null) {
  const r = String(role ?? "").toUpperCase();
  return ["MELQUISEDEC", "SUPER_ADMIN", "ADMINISTRATIVE", "COORDINATOR_COMMERCIAL", "COORDINATOR_CECT", "KOL"].includes(r);
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  try {
    const url = new URL(req.url);
    const delegateActorIdQ = url.searchParams.get("delegateActorId") ?? null;
    const clientIdQ = url.searchParams.get("clientId") ?? null;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));
    const isSupervisor = eff.isSuperAdmin || isSupervisorRole(r.actor.role);

    // Non-supervisors can only query their own actor_id
    const targetActorId = isSupervisor
      ? (delegateActorIdQ ?? String(r.actor.id))
      : String(r.actor.id);

    let q = r.supaService
      .from("crm_followups")
      .select(`
        id, type, note, next_action_at, created_at, updated_at,
        delegate_actor_id,
        client:client_id (id, name, email),
        created_by:created_by_actor_id (id, name, role)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    q = q.eq("delegate_actor_id", targetActorId);
    if (clientIdQ) q = q.eq("client_id", clientIdQ);

    const { data, error } = await q;
    if (error) return json(500, { ok: false, error: error.message });

    return json(200, { ok: true, followups: data ?? [] });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}

export async function POST(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  try {
    const body = await (req as any).json().catch(() => ({}));

    const delegate_actor_id = String(body?.delegate_actor_id ?? "").trim();
    const client_id = String(body?.client_id ?? "").trim();
    const type = String(body?.type ?? "") as FollowUpType;
    const note = String(body?.note ?? "").trim();
    const next_action_at = body?.next_action_at ? String(body.next_action_at) : null;

    if (!delegate_actor_id) return json(400, { ok: false, error: "delegate_actor_id required" });
    if (!client_id) return json(400, { ok: false, error: "client_id required" });
    if (!ALLOWED_TYPES.includes(type)) return json(400, { ok: false, error: `type must be one of: ${ALLOWED_TYPES.join(", ")}` });
    if (!note) return json(400, { ok: false, error: "note required" });

    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));
    const isSupervisor = eff.isSuperAdmin || isSupervisorRole(r.actor.role);

    // Non-supervisors can only create followups for themselves
    if (!isSupervisor && delegate_actor_id !== String(r.actor.id)) {
      return json(403, { ok: false, error: "No autorizado para este delegado" });
    }

    const { data, error } = await r.supaService
      .from("crm_followups")
      .insert({
        delegate_actor_id,
        client_id,
        created_by_actor_id: String(r.actor.id),
        type,
        note,
        next_action_at: next_action_at || null,
      })
      .select()
      .single();

    if (error) return json(500, { ok: false, error: error.message });

    return json(201, { ok: true, followup: data });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}
