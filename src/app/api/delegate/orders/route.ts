// src/app/api/delegate/orders/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";
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

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  let stage = "init";

  try {
    const url = new URL(req.url);
    const delegateIdQuery = url.searchParams.get("delegateId");
    const month = (url.searchParams.get("month") ?? "").trim(); // YYYY-MM

    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    const allowed =
      eff.isSuperAdmin ||
      eff.has("orders.read") ||
      eff.has("orders.manage");

    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (orders.read)" });
    }

    const forcedDelegateId = pickDelegateIdOrThrow({ delegateIdQuery, eff });

    const delegateId = forcedDelegateId
      ? forcedDelegateId
      : await resolveDelegateIdOrThrow({
          supaRls: r.supaRls,
          actor: r.actor,
          delegateIdFromQuery: null,
        });

    let q = r.supaRls
      .from("orders")
      .select(
        `
        id,
        order_number,
        order_date,
        client_id,
        client_name,
        delegate_id,
        status,
        total_net,
        total_gross,
        created_at
      `
      )
      .eq("delegate_id", delegateId)
      .order("order_date", { ascending: false })
      .limit(100);

    if (month) q = q.eq("source_month", month);

    const { data, error } = await q;
    if (error) return json(500, { ok: false, stage, error: error.message });

    return NextResponse.json({
      ok: true,
      delegateId,
      orders: data ?? [],
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado en orders",
    });
  }
}
