// src/app/api/delegate/clients/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

function normalize(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");
  const q = (url.searchParams.get("q") ?? "").trim();

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supa: r.supa,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    let query = r.supa
      .from("clients")
      .select("id, name, tax_id, contact_email, contact_phone, status, profile_type")
      .eq("delegate_id", delegateId)
      .order("name", { ascending: true })
      .limit(20);

    if (q) {
      const nq = normalize(q);
      query = query.or(
        `name.ilike.%${q}%,tax_id.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) return json(500, { ok: false, error: error.message });

    return NextResponse.json({
      ok: true,
      items: data ?? [],
    });
  } catch (e: any) {
    return json(403, { ok: false, error: e?.message ?? "Forbidden" });
  }
}

export async function POST(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supa: r.supa,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    const body = await req.json().catch(() => ({} as any));

    const name = String(body?.name ?? "").trim();
    const tax_id = String(body?.tax_id ?? "").trim();
    const contact_email = body?.contact_email ? String(body.contact_email) : null;
    const contact_phone = body?.contact_phone ? String(body.contact_phone) : null;
    const profile_type = body?.profile_type === "client" ? "client" : "client";

    if (!name) return json(400, { ok: false, error: "name required" });
    if (!tax_id) return json(400, { ok: false, error: "tax_id required" });

    // Crear cliente
    const { data: client, error: cErr } = await r.supa
      .from("clients")
      .insert({
        name,
        tax_id,
        contact_email,
        contact_phone,
        profile_type,
        delegate_id: delegateId,
        status: "active",
      })
      .select("id, name, tax_id")
      .single();

    if (cErr) return json(500, { ok: false, error: cErr.message });

    // Recomendación (opcional)
    const recommender_client_id = body?.recommender_client_id
      ? String(body.recommender_client_id)
      : null;

    if (recommender_client_id) {
      const percentage = toNum(body?.percentage, 7);

      await r.supa.from("client_recommendations").insert({
        recommender_client_id,
        referred_client_id: client.id,
        percentage,
        active: true,
        mode: "delegate",
        delegate_id: delegateId,
      });
    }

    return NextResponse.json({ ok: true, client });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Error creando cliente" });
  }
}
