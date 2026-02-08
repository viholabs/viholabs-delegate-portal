// src/app/api/control-room/affiliate-attribution/unassign/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type ActorLite = {
  id: string;
  role: string | null;
  status?: string | null;
  name?: string | null;
  email?: string | null;
};

type ActorFromRequestOk = {
  ok: true;
  actor: ActorLite;
  supaRls: any;
  supaService?: any;
};

type ActorFromRequestFail = {
  ok: false;
  status: number;
  error: string;
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor && !!ar.supaRls;
}

function hasAnyPermission(
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean },
  codes: string[]
) {
  if (eff.isSuperAdmin) return true;
  return codes.some((c) => eff.has(c));
}

function getServiceClientOrThrow() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function md5(s: string) {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

type PostPayload =
  | { event_hash: string }
  | { invoice_id: string; affiliate_account_id: string };

export async function POST(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor + supaRls (canònic)
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as ActorFromRequestOk | ActorFromRequestFail | any;

    if (!isOk(ar)) {
      return json((ar?.status as number) ?? 401, {
        ok: false,
        stage,
        error: (ar?.error as string) ?? "No autenticado",
      });
    }

    const actor = ar.actor;

    // 2) Permisos
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed = hasAnyPermission(eff, [
      "affiliate_attribution.manage",
      "control_room.affiliate_attribution.manage",
      "actors.manage",
    ]);

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (affiliate_attribution.manage)",
      });
    }

    // 3) Input
    stage = "input";
    const body = (await req.json().catch(() => null)) as any;

    let event_hash = String(body?.event_hash ?? "").trim();

    // Permetem alternativa: invoice_id + affiliate_account_id (calculem el hash canònic)
    if (!event_hash) {
      const invoice_id = String(body?.invoice_id ?? "").trim();
      const affiliate_account_id = String(body?.affiliate_account_id ?? "").trim();

      if (!invoice_id || !isUuid(invoice_id)) {
        return json(422, { ok: false, stage, error: "event_hash o invoice_id requerido (uuid)" });
      }
      if (!affiliate_account_id || !isUuid(affiliate_account_id)) {
        return json(422, { ok: false, stage, error: "affiliate_account_id requerido (uuid)" });
      }

      stage = "event_hash_compute";
      event_hash = md5(`bixgrow|manual|${invoice_id}|${affiliate_account_id}`);
    }

    if (!event_hash) {
      return json(422, { ok: false, stage, error: "event_hash requerido" });
    }

    // 4) Delete idempotent amb SERVICE ROLE
    stage = "service_client";
    const supaService = getServiceClientOrThrow();

    stage = "affiliate_attribution_events.delete";
    const { data: delRows, error: eDel } = await supaService
      .from("affiliate_attribution_events")
      .delete()
      .eq("event_hash", event_hash)
      .select("id");

    if (eDel) return json(500, { ok: false, stage, error: eDel.message });

    const deletedCount = Array.isArray(delRows) ? delRows.length : 0;

    return json(200, {
      ok: true,
      action: deletedCount > 0 ? "deleted" : "noop",
      deleted_count: deletedCount,
      event_hash,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
