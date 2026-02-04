// src/app/api/delegate/comissions/route.ts

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
      eff.has("control_room.delegates.read"); // compat temporal si existe

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
    const period = (url.searchParams.get("period") ?? "").trim(); // opcional: YYYY-MM-01

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin || eff.has("commissions.read") || eff.has("commissions.manage");
    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (commissions.read)" });
    }

    stage = "resolve_delegate";
    const forcedDelegateId = pickDelegateIdOrThrow({ delegateIdQuery, eff });

    const delegateId = forcedDelegateId
      ? forcedDelegateId
      : await resolveDelegateIdOrThrow({
          supaRls: r.supaRls,
          actor: r.actor,
          delegateIdFromQuery: null, // 👈 evitamos rol-hardcode dentro del helper
        });

    stage = "query_commission_monthly";
    let q1 = r.supaRls
      .from("commission_monthly")
      .select(
        "id, beneficiary_type, beneficiary_id, period_month, units_sale, units_promotion, percentage_applied, commission_amount, status, updated_at"
      )
      .eq("beneficiary_type", "delegate")
      .eq("beneficiary_id", delegateId)
      .order("period_month", { ascending: false })
      .limit(50);

    if (period) q1 = q1.eq("period_month", period);

    const { data: commissions, error: e1 } = await q1;
    if (e1) return json(500, { ok: false, stage, error: e1.message });

    stage = "query_payments_optional";
    const ids = (commissions ?? []).map((x: any) => x.id).filter(Boolean);
    let payments: any[] = [];

    if (ids.length) {
      const { data: pay, error: e2 } = await r.supaRls
        .from("commission_payments")
        .select("id, commission_monthly_id, paid_at, amount_paid, payment_ref, notes")
        .in("commission_monthly_id", ids)
        .order("paid_at", { ascending: false });

      if (e2) return json(500, { ok: false, stage, error: e2.message });
      payments = pay ?? [];
    }

    return NextResponse.json({
      ok: true,
      delegateId,
      commissions: commissions ?? [],
      payments,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
