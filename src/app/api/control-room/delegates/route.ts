// src/app/api/control-room/delegates/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

type RpcPermRow = { perm_code: string | null };

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normalizePermCode(v: any) {
  return String(v ?? "").trim();
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

    const { actor, supaService, supaRls } = ar as {
      actor: { id: string; role: string | null; status?: string | null; name?: string | null; email?: string | null };
      supaService: any;
      supaRls: any;
    };

    // 2) Permisos efectivos (RBAC + overrides) vía función SQL canonical: effective_permissions(actor_id)
    //    Biblia: actors.read es permiso canónico para lectura de actores (y listados de personas/identidades).
    stage = "effective_permissions";
    const { data: permData, error: permErr } = await supaService.rpc(
      "effective_permissions",
      { p_actor_id: actor.id }
    );

    if (permErr) {
      return json(500, { ok: false, stage, error: permErr.message });
    }

    const rows = (permData ?? []) as RpcPermRow[];
    const codes = rows
      .map((r) => normalizePermCode(r?.perm_code))
      .filter((x) => x.length > 0);

    const isSuperAdmin = codes.includes("*");
    const perms = new Set<string>(codes);

    const has = (perm: string) => (isSuperAdmin ? true : perms.has(perm));

    stage = "authorize";
    if (!has("actors.read")) {
      return json(403, { ok: false, stage, error: "No autorizado (actors.read)" });
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
