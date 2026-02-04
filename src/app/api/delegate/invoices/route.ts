// src/app/api/delegate/invoices/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function pickDelegateIdOrThrow(args: {
  delegateIdQuery: string | null;
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean };
}) {
  const { delegateIdQuery, eff } = args;

  // Supervisión SOLO por permisos efectivos (Biblia)
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
    const paid = url.searchParams.get("paid"); // "true" | "false" | null

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("invoices.read") ||
      eff.has("invoices.manage");

    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (invoices.read)" });
    }

    stage = "resolve_delegate";
    const forcedDelegateId = pickDelegateIdOrThrow({ delegateIdQuery, eff });

    const delegateId = forcedDelegateId
      ? forcedDelegateId
      : await resolveDelegateIdOrThrow({
          supaRls: r.supaRls,
          actor: r.actor,
          delegateIdFromQuery: null, // evitamos rol-hardcode
        });

    stage = "query_invoices";
    let q = r.supaRls
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        invoice_date,
        client_id,
        client_name,
        delegate_id,
        is_paid,
        paid_date,
        total_net,
        total_gross,
        source_month,
        source_provider,
        source_filename,
        created_at
      `
      )
      .eq("delegate_id", delegateId)
      .order("invoice_date", { ascending: false })
      .limit(100);

    if (month) {
      q = q.eq("source_month", month);
    }

    if (paid === "true") q = q.eq("is_paid", true);
    if (paid === "false") q = q.eq("is_paid", false);

    const { data, error } = await q;
    if (error) return json(500, { ok: false, stage, error: error.message });

    return NextResponse.json({
      ok: true,
      delegateId,
      invoices: data ?? [],
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado en invoices",
    });
  }
}
