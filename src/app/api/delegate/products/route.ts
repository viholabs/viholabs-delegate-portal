// src/app/api/delegate/products/route.ts

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

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("products.read");

    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (products.read)" });
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

    stage = "query_products";
    const { data, error } = await r.supaRls
      .from("products")
      .select(
        `
        id,
        sku,
        name,
        category,
        active,
        price_net,
        price_gross,
        created_at
      `
      )
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      return json(500, { ok: false, stage, error: error.message });
    }

    return NextResponse.json({
      ok: true,
      delegateId,
      products: data ?? [],
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado en products",
    });
  }
}
