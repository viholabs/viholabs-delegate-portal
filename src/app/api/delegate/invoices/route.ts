// src/app/api/delegate/invoices/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

function toBool(v: any): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return null;
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");
  const isPaid = toBool(url.searchParams.get("is_paid"));
  const month = (url.searchParams.get("month") ?? "").trim(); // YYYY-MM-01 opcional

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supaRls: r.supaRls,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    let q = r.supaRls
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        invoice_date,
        is_paid,
        total_net,
        total_vat,
        total_gross,
        delegate_id,
        client_id,
        clients:client_id ( id, name, tax_id )
      `
      )
      .eq("delegate_id", delegateId)
      .order("invoice_date", { ascending: false })
      .limit(100);

    if (isPaid !== null) q = q.eq("is_paid", isPaid);
    if (month) q = q.eq("period_month", month);

    const { data, error } = await q;
    if (error) return json(500, { ok: false, error: error.message });

    return NextResponse.json({
      ok: true,
      delegateId,
      items: data ?? [],
    });
  } catch (e: any) {
    return json(403, { ok: false, error: e?.message ?? "Forbidden" });
  }
}
