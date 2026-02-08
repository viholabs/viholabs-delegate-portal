// src/app/api/control-room/ui-contract/route.ts

import { NextResponse } from "next/server";
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
};

type ActorFromRequestFail = {
  ok: false;
  status: number;
  error: string;
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor && !!ar.supaRls;
}

function normalizeLocale(v: unknown) {
  const s = String(v ?? "").trim();
  if (s === "es-ES") return "es-ES";
  if (s === "ca-ES") return "ca-ES";
  if (s === "en-GB") return "en-GB";
  return "es-ES";
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as
      | ActorFromRequestOk
      | ActorFromRequestFail;

    if (!isOk(ar)) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaRls } = ar;

    // 2) Permisos
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("control_room.dashboard.read") ||
      eff.has("control_room.month.read") ||
      eff.has("actors.read");

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (control_room.dashboard.read)",
      });
    }

    // 3) Payload
    stage = "payload";
    const body = await req.json().catch(() => ({} as any));
    const locale = normalizeLocale(body?.locale);

    // 4) RPC
    stage = "rpc_get_ui_contract";
    const { data, error } = await supaRls.rpc("rpc_get_ui_contract", {
      p_locale: locale,
    });

    if (error) {
      return json(500, {
        ok: false,
        stage,
        error: error.message,
      });
    }

    // 5) Shape CANÒNIC per frontend
    return json(200, {
      ok: true,
      locale,
      state_ui: data?.state_ui ?? [],
      screen_content: data?.screen_content ?? [],
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}
