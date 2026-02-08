// src/app/api/control-room/invoices/promote/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    // 1) Actor actual (sessió)
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!ar?.ok) {
      return json(ar?.status ?? 401, { error: ar?.error ?? "Unauthorized" });
    }

    const actorId: string = ar.actor.id;

    // 2) Permisos efectius (service role intern, via helper canònic)
    stage = "permissions";
    const eff = await getEffectivePermissionsByActorId(actorId);

    if (!eff.has("invoices.manage")) {
      return json(403, { error: "Missing permission: invoices.manage" });
    }

    // 3) RPC promote (funció SECURITY DEFINER a BD)
    stage = "rpc_promote";
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "promote_import_invoice_staging_v1",
      { p_promoter_actor_id: actorId }
    );

    if (error) {
      return json(500, {
        error: "Promote execution failed",
        stage,
        detail: error.message,
      });
    }

    return json(200, {
      ok: true,
      promoted_by_actor_id: actorId,
      results: data ?? [],
    });
  } catch (err: any) {
    return json(500, {
      error: "Unexpected error",
      stage,
      detail: err?.message ?? String(err),
    });
  }
}
