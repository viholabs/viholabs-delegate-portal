// src/app/api/delegate/orders/status/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../../_utils";

export const runtime = "nodejs";

const ALLOWED: string[] = ["pending", "received", "prepared", "shipped", "delivered", "invoiced"];

function normStatus(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

export async function PUT(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supaRls: r.supaRls,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    const body = await req.json().catch(() => ({} as any));
    const orderId = String(body?.order_id ?? body?.id ?? "").trim();
    const status = normStatus(body?.status);

    if (!orderId) return json(400, { ok: false, error: "order_id required" });
    if (!status) return json(400, { ok: false, error: "status required" });
    if (!ALLOWED.includes(status)) {
      return json(400, { ok: false, error: `Invalid status. Allowed: ${ALLOWED.join(", ")}` });
    }

    // 1) Comprobar ownership con RLS (si no lo puede ver, no lo puede tocar)
    const { data: ord, error: oErr } = await r.supaRls
      .from("orders")
      .select("id, delegate_id, status")
      .eq("id", orderId)
      .eq("delegate_id", delegateId)
      .maybeSingle();

    if (oErr) return json(500, { ok: false, error: oErr.message });
    if (!ord) return json(404, { ok: false, error: "Order not found (or not in delegate scope)" });

    // 2) Update con SERVICE ROLE (escritura interna controlada)
    const { data: updated, error: uErr } = await r.supaService
      .from("orders")
      .update({
        status,
        updated_by_actor_id: r.actor.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("id, status, updated_at")
      .single();

    if (uErr) return json(500, { ok: false, error: uErr.message });

    return NextResponse.json({ ok: true, order: updated });
  } catch (e: any) {
    return json(403, { ok: false, error: e?.message ?? "Forbidden" });
  }
}
