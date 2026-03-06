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
    const supaRls = ar.supaRls;

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

    // ✅ Fuente canónica real: public.actors con role=delegate y status=active
    stage = "delegates_select";
    const { data: delegates, error: dErr } = await supaRls
      .from("actors")
      .select("id, name, email, role, status")
      .eq("role", "delegate")
      .eq("status", "active")
      .order("name", { ascending: true });

    if (dErr) {
      return json(500, { ok: false, stage, error: dErr.message });
    }

    return json(200, {
      ok: true,
      actor: {
        id: String(actor.id),
        role: actor.role ?? null,
        name: actor.name ?? actor.email ?? null,
      },
      delegates: Array.isArray(delegates)
        ? delegates.map((d: any) => ({
            id: String(d.id),
            name: d?.name ?? null,
            email: d?.email ?? null,
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