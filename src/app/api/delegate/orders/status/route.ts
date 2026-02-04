// src/app/api/delegate/orders/status/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../../_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function pickDelegateIdOrThrow(args: {
  delegateIdQuery: string | null;
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean };
}) {
  const { delegateIdQuery, eff } = args;

  if (delegateIdQuery) {
    const allowed =
      eff.isSuperAdmin ||
      eff.has("actors.read") ||
      eff.has("control_room.delegates.read");

    if (!allowed) {
      throw new Error("No autorizado para supervisión (actors.read)");
    }
    return delegateIdQuery;
  }

  return null;
}

export async function POST(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  let stage = "init";

  try {
    const url = new URL(req.url);
    const delegateIdQuery = url.searchParams.get("delegateId");

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("orders.manage");

    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (orders.manage)" });
    }

    stage = "resolve_delegate";
    const forcedDelegateId = pickDelegateIdOrThrow({ delegateIdQuery, eff });

    const delegateId = forcedDelegateId
      ? forcedDelegateId
      : await resolveDelegateIdOrThrow({
          supaRls: r.supaRls,
          actor: r.actor,
          delegateIdFromQuery: null,
        });

    stage = "body";
    const body = await req.json().catch(() => ({} as any));
    const order_id = String(body?.order_id ?? "").trim();
    const status = String(body?.status ?? "").trim();

    if (!order_id) {
      return json(400, { ok: false, stage, error: "order_id required" });
    }
    if (!status) {
      return json(400, { ok: false, stage, error: "status required" });
    }

    // Escritura controlada con SERVICE ROLE
    stage = "update_status";
    const { error } = await r.supaService
      .from("orders")
      .update({ status })
      .eq("id", order_id)
      .eq("delegate_id", delegateId);

    if (error) {
      return json(500, { ok: false, stage, error: error.message });
    }

    return NextResponse.json({
      ok: true,
      order_id,
      status,
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error actualizando estado del pedido",
    });
  }
}
