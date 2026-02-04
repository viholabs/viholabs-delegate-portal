// src/app/api/delegate/clients/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

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

function pickDelegateIdOrThrow(args: {
  delegateIdQuery: string | null;
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean };
  r: any;
}) {
  const { delegateIdQuery, eff, r } = args;

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

  // Self: resolver delegateId desde actor (RLS)
  return null;
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  let stage = "init";

  try {
    const url = new URL(req.url);
    const delegateIdQuery = url.searchParams.get("delegateId");
    const q = (url.searchParams.get("q") ?? "").trim();

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin || eff.has("clients.read") || eff.has("clients.manage");
    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (clients.read)" });
    }

    stage = "resolve_delegate";
    const delegateIdForced = pickDelegateIdOrThrow({ delegateIdQuery, eff, r });

    const delegateId = delegateIdForced
      ? delegateIdForced
      : await resolveDelegateIdOrThrow({
          supaRls: r.supaRls,
          actor: r.actor,
          delegateIdFromQuery: null, // 👈 evitamos rol-hardcode dentro del helper
        });

    stage = "query";
    let query = r.supaRls
      .from("clients")
      .select("id, name, tax_id, contact_email, contact_phone, status, profile_type, created_at, delegate_id")
      .eq("delegate_id", delegateId)
      .order("name", { ascending: true })
      .limit(50);

    if (q) {
      const nq = normalize(q);
      // Búsqueda simple (ilike) — RLS decide alcance
      query = query.or(
        [
          `name.ilike.%${q}%`,
          `tax_id.ilike.%${q}%`,
          `contact_email.ilike.%${q}%`,
          `name.ilike.%${nq}%`,
          `tax_id.ilike.%${nq}%`,
          `contact_email.ilike.%${nq}%`,
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) return json(500, { ok: false, stage, error: error.message });

    return NextResponse.json({
      ok: true,
      delegateId,
      items: data ?? [],
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
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
      eff.isSuperAdmin || eff.has("clients.manage");
    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (clients.manage)" });
    }

    stage = "resolve_delegate";
    const delegateIdForced = pickDelegateIdOrThrow({ delegateIdQuery, eff, r });

    const delegateId = delegateIdForced
      ? delegateIdForced
      : await resolveDelegateIdOrThrow({
          supaRls: r.supaRls,
          actor: r.actor,
          delegateIdFromQuery: null, // 👈 evitamos rol-hardcode
        });

    stage = "body";
    const body = await req.json().catch(() => ({} as any));

    const name = String(body?.name ?? "").trim();
    const tax_id = String(body?.tax_id ?? "").trim();
    const contact_email = body?.contact_email ? String(body.contact_email).trim() : null;
    const contact_phone = body?.contact_phone ? String(body.contact_phone).trim() : null;
    const profile_type = String(body?.profile_type ?? "client").trim();

    if (!name) return json(400, { ok: false, stage, error: "name required" });
    if (!tax_id) return json(400, { ok: false, stage, error: "tax_id required" });

    // ✅ Escritura: SERVICE ROLE (Biblia)
    stage = "insert_client";
    const { data: client, error: cErr } = await r.supaService
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
      .select("id, name, tax_id, contact_email, status, delegate_id")
      .single();

    if (cErr) return json(500, { ok: false, stage, error: cErr.message });

    // Recomendación (opcional) — usando schema REAL (sin columnas inventadas)
    stage = "insert_recommendation_optional";
    const recommender_client_id = body?.recommender_client_id
      ? String(body.recommender_client_id).trim()
      : null;

    if (recommender_client_id) {
      const percentage = toNum(body?.percentage, 7);

      const { error: recErr } = await r.supaService.from("client_recommendations").insert({
        recommender_client_id,
        referred_client_id: client.id,
        percentage,
        active: true,
        mode: "deduct", // según schema: deduct/additive
      });

      if (recErr) return json(500, { ok: false, stage, error: recErr.message });
    }

    return NextResponse.json({ ok: true, delegateId, client });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error creando cliente" });
  }
}
