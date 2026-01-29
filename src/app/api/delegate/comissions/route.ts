// src/app/api/delegate/comissions/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");
  const period = (url.searchParams.get("period") ?? "").trim(); // "YYYY-MM-01" opcional

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supa: r.supa,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    // 1) comisión del delegado (beneficiary_type = delegate, beneficiary_id = delegateId)
    let q1 = r.supa
      .from("commission_monthly")
      .select(
        "id, beneficiary_type, beneficiary_id, period_month, units_sale, units_promotion, percentage_applied, commission_amount, status, updated_at"
      )
      .eq("beneficiary_type", "delegate")
      .eq("beneficiary_id", delegateId)
      .order("period_month", { ascending: false })
      .limit(50);

    if (period) q1 = q1.eq("period_month", period);

    const { data: delegateRows, error: e1 } = await q1;
    if (e1) return json(500, { ok: false, error: e1.message });

    // 2) pagos (si existen)
    const ids = (delegateRows ?? []).map((x: any) => x.id);
    let payments: any[] = [];

    if (ids.length) {
      const { data: pay, error: e2 } = await r.supa
        .from("commission_payments")
        .select("id, commission_monthly_id, paid_at, amount_paid, payment_ref, notes")
        .in("commission_monthly_id", ids)
        .order("paid_at", { ascending: false });

      if (e2) return json(500, { ok: false, error: e2.message });
      payments = pay ?? [];
    }

    return NextResponse.json({
      ok: true,
      delegateId,
      commissions: delegateRows ?? [],
      payments,
    });
  } catch (e: any) {
    return json(403, { ok: false, error: e?.message ?? "Forbidden" });
  }
}
