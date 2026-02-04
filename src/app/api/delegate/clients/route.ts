// src/app/api/delegate/clients/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

type RpcPermRow = { perm_code: string | null };

function normalizePermCode(v: unknown) {
  return String(v ?? "").trim();
}

async function getPermsOrThrow(supaService: any, actorId: string) {
  const { data, error } = await supaService.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  if (error) throw new Error(`effective_permissions failed: ${error.message}`);

  const rows = (data ?? []) as RpcPermRow[];
  const codes = rows
    .map((r) => normalizePermCode(r?.perm_code))
    .filter((x) => x.length > 0);

  const isSuperAdmin = codes.includes("*");
  const perms = new Set<string>(codes);

  return {
    isSuperAdmin,
    has: (perm: string) => (isSuperAdmin ? true : perms.has(perm)),
  };
}

function normalize(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNum(v: unknown, fallback = 0) {
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
    const eff = await getPermsOrThrow(r.supaService, r.actor.id);

    // Autorización canónica: lectura de clientes
    const allowed =
      eff.isSuperAdmin ||
      eff.has("clients.read") ||
      eff.has("clients.manage");

    if (!allowed) {
      return json(403, { ok: false, error: "No autorizado (clients.read)" });
    }

    const delegateId = await resolveDelegateIdOrThrow({
      supaRls: r.supaRls,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
      effectivePerms: eff,
    });

    let query = r.supaRls
      .from("clients")
      .select("id, name, tax_id, contact_email, contact_phone, status, profile_type")
      .eq("delegate_id", delegateId)
      .order("name", { ascending: true })
      .limit(20);

    if (q) {
      const _nq = normalize(q);
      // Búsqueda simple (ilike) — RLS ya limita por delegate_id
      query = query.or(`name.ilike.%${_nq}%,tax_id.ilike.%${_nq}%`);
    }

    const { data, error } = await query;
    if (error) return json(500, { ok: false, error: error.message });

    return NextResponse.json({
      ok: true,
      items: data ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Forbidden";
    return json(403, { ok: false, error: msg });
  }
}

export async function POST(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");

  try {
    const eff = await getPermsOrThrow(r.supaService, r.actor.id);

    // Autorización canónica: creación/gestión de clientes
    const allowed =
      eff.isSuperAdmin ||
      eff.has("clients.manage");

    if (!allowed) {
      return json(403, { ok: false, error: "No autorizado (clients.manage)" });
    }

    const delegateId = await resolveDelegateIdOrThrow({
      supaRls: r.supaRls,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
      effectivePerms: eff,
    });

    const body = (await req.json().catch(() => ({} as Record<string, unknown>))) ?? {};

    const name = String(body?.name ?? "").trim();
    const tax_id = String(body?.tax_id ?? "").trim();
    const contact_email = body?.contact_email ? String(body.contact_email) : null;
    const contact_phone = body?.contact_phone ? String(body.contact_phone) : null;
    const profile_type = "client";

    if (!name) return json(400, { ok: false, error: "name required" });
    if (!tax_id) return json(400, { ok: false, error: "tax_id required" });

    // Crear cliente (SERVICE ROLE: escritura interna controlada)
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
      .select("id, name, tax_id")
      .single();

    if (cErr) return json(500, { ok: false, error: cErr.message });

    // Recomendación (opcional) — se mantiene tal cual estaba (solo añadimos seguridad arriba)
    const recommender_client_id = body?.recommender_client_id
      ? String(body.recommender_client_id)
      : null;

    if (recommender_client_id) {
      const percentage = toNum(body?.percentage, 7);

      const { error: recErr } = await r.supaService.from("client_recommendations").insert({
        recommender_client_id,
        referred_client_id: client.id,
        percentage,
        active: true,
        // ⚠️ Dejamos campos legacy tal como estaban en tu dump para no abrir melón de schema ahora.
        // Si el schema final difiere, lo ajustamos en un paso posterior y controlado.
        mode: "delegate" as any,
        delegate_id: delegateId as any,
      });

      if (recErr) return json(500, { ok: false, error: recErr.message });
    }

    return NextResponse.json({ ok: true, client });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error creando cliente";
    return json(500, { ok: false, error: msg });
  }
}
