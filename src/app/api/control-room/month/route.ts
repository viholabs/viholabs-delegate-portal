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

function pickName(obj: any) {
  return obj?.name ?? obj?.contact_email ?? obj?.email ?? "—";
}

export async function POST(req: NextRequest) {
  const stageBase = "api/control-room/month";

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !anon || !service) {
      return json(500, {
        ok: false,
        stage: `${stageBase}:env`,
        error: "Faltan variables de entorno de Supabase",
      });
    }

    const body = await req.json().catch(() => null);
    const month = String(body?.month ?? "");

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
        error: "Falta Bearer token",
      });
    }

    // 1) Validar sesión con ANON
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

    // 2) DB con SERVICE ROLE (bypass RLS)
    const supabase = createClient(url, service, {
      auth: { persistSession: false },
    });

    // 3) Actor (NO bloqueante en MVP)
    const { data: actor, error: actorErr } = await supabase
      .from("actors")
      .select("id, role, status, name, email")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    const warning_actor_missing = !!actorErr || !actor;

    if (actor && actor.status === "inactive") {
      return json(403, {
        ok: false,
        stage: `${stageBase}:actor`,
        error: "Actor inactivo",
      });
    }

    // 4) KPI Month Summary (REAL)
    const { data: kpiMonthRows, error: kpiMonthErr } = await supabase.rpc(
      "kpi_month_summary",
      { p_month: month }
    );

    if (kpiMonthErr) {
      return json(500, {
        ok: false,
        stage: `${stageBase}:kpi_month_summary`,
        error: kpiMonthErr.message,
      });
    }

    const kpi_month = Array.isArray(kpiMonthRows) ? kpiMonthRows[0] : kpiMonthRows;

    // 5) commission_monthly (en tu schema: units_sale, units_promotion)
    const { data: cmRows, error: cmErr } = await supabase
      .from("commission_monthly")
      .select(
        "beneficiary_type, beneficiary_id, commission_amount, units_sale, units_promotion, period_month, calc_meta"
      )
      .eq("period_month", month);

    if (cmErr) {
      return json(500, {
        ok: false,
        stage: `${stageBase}:commission_monthly`,
        error: cmErr.message,
      });
    }

    const rows = Array.isArray(cmRows) ? cmRows : [];

    const totalDevengado = rows.reduce(
      (acc: number, r: any) => acc + Number(r.commission_amount ?? 0),
      0
    );

    const calcMetas = rows
      .map((r: any) => r.calc_meta)
      .filter(Boolean)
      .slice(0, 50);

    const delegatesRows = rows
      .filter((r: any) => r.beneficiary_type === "delegate")
      .sort(
        (a: any, b: any) =>
          Number(b.commission_amount ?? 0) - Number(a.commission_amount ?? 0)
      )
      .slice(0, 10);

    const recommRows = rows
      .filter((r: any) => r.beneficiary_type === "client_recommender")
      .sort(
        (a: any, b: any) =>
          Number(b.commission_amount ?? 0) - Number(a.commission_amount ?? 0)
      )
      .slice(0, 10);

    // Resolver nombres (delegates + clients)
    const delegateIds = Array.from(
      new Set(delegatesRows.map((r: any) => String(r.beneficiary_id)))
    );
    const recommClientIds = Array.from(
      new Set(recommRows.map((r: any) => String(r.beneficiary_id)))
    );

    const [delegatesRes, clientsRes] = await Promise.all([
      delegateIds.length
        ? supabase
            .from("delegates")
            .select("id, name, email, actor_id")
            .in("id", delegateIds)
        : Promise.resolve({ data: [], error: null } as any),

      recommClientIds.length
        ? supabase
            .from("clients")
            .select("id, name, contact_email, tax_id")
            .in("id", recommClientIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (delegatesRes?.error) {
      return json(500, {
        ok: false,
        stage: `${stageBase}:delegates`,
        error: delegatesRes.error.message,
      });
    }
    if (clientsRes?.error) {
      return json(500, {
        ok: false,
        stage: `${stageBase}:clients`,
        error: clientsRes.error.message,
      });
    }

    const delegatesById = new Map<string, any>(
      (delegatesRes.data ?? []).map((d: any) => [String(d.id), d])
    );
    const clientsById = new Map<string, any>(
      (clientsRes.data ?? []).map((c: any) => [String(c.id), c])
    );

    const rankingsDelegates = delegatesRows.map((r: any) => {
      const d = delegatesById.get(String(r.beneficiary_id));
      return {
        id: String(r.beneficiary_id),
        name: d?.name ?? d?.email ?? "—",
        email: d?.email ?? null,
        units_sale: Number(r.units_sale ?? 0) || 0,
        units_promotion: Number(r.units_promotion ?? 0) || 0,
        commission: Number(r.commission_amount ?? 0) || 0,
      };
    });

    const rankingsRecommenders = recommRows.map((r: any) => {
      const c = clientsById.get(String(r.beneficiary_id));
      return {
        id: String(r.beneficiary_id),
        name: pickName(c),
        contact_email: c?.contact_email ?? null,
        tax_id: c?.tax_id ?? null,
        units_sale: Number(r.units_sale ?? 0) || 0,
        units_promotion: Number(r.units_promotion ?? 0) || 0,
        commission: Number(r.commission_amount ?? 0) || 0,
      };
    });

    // Actividad: últimas importaciones (según tu schema real)
    let recentImports: any[] = [];
    const { data: ingestaData, error: ingestaErr } = await supabase
      .from("ingesta_log")
      .select("id, usuario_email, fecha_procesado, num_pdfs, num_ok")
      .order("fecha_procesado", { ascending: false })
      .limit(5);

    if (!ingestaErr && Array.isArray(ingestaData)) recentImports = ingestaData;

    return json(200, {
      ok: true,
      month,
      actor: warning_actor_missing
        ? {
            id: null,
            role: "unknown",
            name:
              userData.user.user_metadata?.name ??
              userData.user.email ??
              "—",
          }
        : {
            id: actor.id,
            role: actor.role,
            name: actor.name ?? actor.email ?? "—",
          },
      warning_actor_missing,
      kpi_month,
      totals: {
        total_devengado_commissions: Number(totalDevengado.toFixed(2)),
      },
      rankingsDelegates,
      rankingsRecommenders,
      activity: {
        recent_imports: recentImports,
        calc_meta_sample: calcMetas[0] ?? null,
      },
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage: `api/control-room/month:unhandled`,
      error: e?.message ?? "Unknown error",
    });
  }
}
