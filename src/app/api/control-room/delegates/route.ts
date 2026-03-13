// src/app/api/control-room/delegates/route.ts

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
  supaService: any;
};

type ActorFromRequestFail = {
  ok: false;
  status: number;
  error: string;
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor && !!ar.supaService;
}

async function handle(req: Request) {
  let stage = "init";

  try {
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
    const supaService = ar.supaService;

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("control_room.delegates.read") ||
      eff.has("actors.read");

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (control_room.delegates.read)",
      });
    }

    stage = "delegates_select";
    const { data, error } = await supaService
      .from("v_control_room_delegates_active")
      .select("delegate_actor_id, delegate_name, delegate_email")
      .order("delegate_name", { ascending: true });

    if (error) {
      return json(500, {
        ok: false,
        stage,
        error: error.message,
      });
    }

    return json(200, {
      ok: true,
      actor: {
        id: String(actor.id),
        role: actor.role ?? null,
        name: actor.name ?? actor.email ?? null,
      },
      delegates: Array.isArray(data)
        ? data.map((d: any) => ({
            id: String(d?.delegate_actor_id ?? ""),
            name: d?.delegate_name ?? null,
            email: d?.delegate_email ?? null,
          }))
        : [],
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}