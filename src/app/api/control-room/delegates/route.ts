// src/app/api/control-room/delegates/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor + supabase clients (service + RLS) desde el helper canónico del repo
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaRls } = ar as {
      actor: {
        id: string;
        role: string | null;
        status?: string | null;
        name?: string | null;
        email?: string | null;
      };
      supaRls: any;
    };

    // 2) Permisos efectivos (RBAC + overrides) — Biblia
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(actor.id);

    // Permiso canónico recomendado para este endpoint:
    // - control_room.delegates.read
    // Compatibilidad temporal: aceptamos actors.read si aún no existe el permiso nuevo en SQL.
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

    // 3) Lectura con RLS (la BD decide qué delegates ve este actor)
    stage = "delegates_select";
    const { data: rowsDelegates, error: dErr } = await supaRls
      .from("delegates")
      .select("id, name, email")
      .order("name", { ascending: true });

    if (dErr) {
      return json(500, { ok: false, stage, error: dErr.message });
    }

    return json(200, {
      ok: true,
      actor: {
        id: String(actor.id),
        role: actor.role ?? null,
        name: (actor as any).name ?? (actor as any).email ?? null,
      },
      delegates: Array.isArray(rowsDelegates) ? rowsDelegates : [],
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}
