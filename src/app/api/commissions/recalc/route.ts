import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isValidMonthYYYYMM01(value: string) {
  return /^\d{4}-\d{2}-01$/.test(value);
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const stageBase = "api/commissions/recalc";

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anon || !service) {
      return json(500, {
        ok: false,
        stage: `${stageBase}:env`,
        error: "Faltan variables de entorno",
      });
    }

    const body = await req.json().catch(() => null);
    const month = String(body?.month ?? "");
    const channel = String(body?.channel ?? "pdv");

    if (!isValidMonthYYYYMM01(month)) {
      return json(422, {
        ok: false,
        stage: `${stageBase}:input`,
        error: "month inválido (YYYY-MM-01)",
      });
    }

    const token = getBearerToken(req);
    if (!token) {
      return json(401, {
        ok: false,
        stage: `${stageBase}:auth`,
        error: "Falta Authorization Bearer token",
      });
    }

    const supabaseAnon = createClient(url, anon, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } =
      await supabaseAnon.auth.getUser(token);

    if (userErr || !userData?.user) {
      return json(401, {
        ok: false,
        stage: `${stageBase}:auth`,
        error: "Token inválido",
      });
    }

    const supabaseSrv = createClient(url, service, {
      auth: { persistSession: false },
    });

    const { data: actor, error: actorErr } = await supabaseSrv
      .from("actors")
      .select("id, role, status, name, email")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (actorErr || !actor) {
      return json(403, {
        ok: false,
        stage: `${stageBase}:actor`,
        error: "Actor no encontrado",
      });
    }

    if (actor.status === "inactive") {
      return json(403, {
        ok: false,
        stage: `${stageBase}:actor`,
        error: "Actor inactivo",
      });
    }

    const ALLOWED_ROLES = new Set([
      "super_admin",
      "administrativo",
      "admin_operativo",
      "coordinador_comercial",
    ]);

    if (!ALLOWED_ROLES.has(actor.role)) {
      return json(403, {
        ok: false,
        stage: `${stageBase}:authz`,
        error: "Rol no autorizado",
        role: actor.role,
      });
    }

    const { error: rpcErr } = await supabaseSrv.rpc(
      "recalc_commissions_month",
      {
        p_month: month,
        p_channel: channel,
      }
    );

    if (rpcErr) {
      return json(500, {
        ok: false,
        stage: `${stageBase}:rpc`,
        error: rpcErr.message,
      });
    }

    const { data: kpi } = await supabaseSrv.rpc("kpi_global", {
      p_period: "month",
      p_anchor: month,
    });

    return json(200, {
      ok: true,
      month,
      channel,
      actor: { id: actor.id, role: actor.role, name: actor.name },
      kpi: kpi?.[0] ?? null,
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage: `${stageBase}:unhandled`,
      error: e?.message ?? "Unknown error",
    });
  }
}
