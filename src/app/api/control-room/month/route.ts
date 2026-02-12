// src/app/api/control-room/month/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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

function isMonth01(s: string) {
  return /^\d{4}-\d{2}-01$/.test(s);
}

function pickName(obj: any) {
  return obj?.name ?? obj?.contact_email ?? obj?.email ?? "—";
}

/**
 * SERVICE ROLE client (SUPER_ADMIN = Déu):
 * - Al Control Room, el SUPER_ADMIN ha de poder veure KPI i comissions sense RLS.
 * - Evita errors per policies circulars / permisos incomplets en MVP.
 */
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

type MonthStateCode = "OPEN" | "LOCKED" | "UNKNOWN";

/**
 * Determinista:
 * - Intenta llegir el lock/state real des de backend (commission_month_locks) amb diferents claus.
 * - Si no hi ha dades (o la taula no existeix encara), aplica default contractual: OPEN.
 * - No trenca mai la UI.
 */
async function getMonthStateCode(admin: any, month01: string): Promise<{
  state_code: MonthStateCode;
  source: "commission_month_locks.period_month" | "commission_month_locks.month" | "default_open";
  lock_row: any | null;
  warning_fallback: boolean;
}> {
  const monthKey = month01.slice(0, 7); // YYYY-MM

  // 1) Prova: commission_month_locks.period_month = YYYY-MM-01
  {
    const { data, error } = await admin
      .from("commission_month_locks")
      .select("*")
      .eq("period_month", month01)
      .limit(1);

    if (!error && Array.isArray(data) && data[0]) {
      const row = data[0];
      const sc = String(row.state_code ?? "").toUpperCase();
      const state_code: MonthStateCode =
        sc === "LOCKED" ? "LOCKED" : sc === "OPEN" ? "OPEN" : row.is_locked === true ? "LOCKED" : "OPEN";

      return {
        state_code,
        source: "commission_month_locks.period_month",
        lock_row: row,
        warning_fallback: false,
      };
    }
  }

  // 2) Prova: commission_month_locks.month = YYYY-MM
  {
    const { data, error } = await admin
      .from("commission_month_locks")
      .select("*")
      .eq("month", monthKey)
      .limit(1);

    if (!error && Array.isArray(data) && data[0]) {
      const row = data[0];
      const sc = String(row.state_code ?? "").toUpperCase();
      const state_code: MonthStateCode =
        sc === "LOCKED" ? "LOCKED" : sc === "OPEN" ? "OPEN" : row.is_locked === true ? "LOCKED" : "OPEN";

      return {
        state_code,
        source: "commission_month_locks.month",
        lock_row: row,
        warning_fallback: false,
      };
    }
  }

  // 3) Default contractual: OPEN (si no hi ha lock registrat, el mes és obert)
  return {
    state_code: "OPEN",
    source: "default_open",
    lock_row: null,
    warning_fallback: true,
  };
}

async function handle(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor + supaRls (canónico)
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as
      | ActorFromRequestOk
      | ActorFromRequestFail
      | any;

    if (!isOk(ar)) {
      return json((ar?.status as number) ?? 401, {
        ok: false,
        stage,
        error: (ar?.error as string) ?? "No autenticado",
      });
    }

    const actor = ar.actor;
    const supaRls = ar.supaRls;

    // 2) Permisos efectivos (SUPER_ADMIN = allowed)
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("control_room.dashboard.read") ||
      eff.has("control_room.month.read") ||
      eff.has("control_room.invoices.read") ||
      eff.has("actors.read");

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (control_room.month.read)",
      });
    }

    // 3) Input (month)
    stage = "input";
    const body = await req.json().catch(() => null);
    const month = String(body?.month ?? "");

    if (!isMonth01(month)) {
      return json(422, {
        ok: false,
        stage,
        error: "month inválido (YYYY-MM-01)",
      });
    }

    // SERVICE ROLE client per tot el bloc "executive view"
    const admin = getServiceSupabase();

    // 3.1) Month state_code contractual (REAL -> fallback OPEN)
    stage = "month_state_code";
    const monthState = await getMonthStateCode(admin, month);

    // 4) KPI Month Summary (SERVICE ROLE + función estable v1)
    stage = "kpi_month_summary";
    const { data: kpiMonthRows, error: kpiMonthErr } = await admin.rpc(
      "kpi_month_summary_v1",
      { p_month: month }
    );

    if (kpiMonthErr) {
      return json(500, { ok: false, stage, error: kpiMonthErr.message });
    }

    const kpi_month = Array.isArray(kpiMonthRows)
      ? kpiMonthRows[0]
      : kpiMonthRows;

    // 5) commission_monthly (SERVICE ROLE: SUPER_ADMIN ho veu tot)
    stage = "commission_monthly";
    const { data: cmRows, error: cmErr } = await admin
      .from("commission_monthly")
      .select(
        "beneficiary_type, beneficiary_id, commission_amount, units_sale, units_promotion, period_month, calc_meta"
      )
      .eq("period_month", month);

    if (cmErr) {
      return json(500, { ok: false, stage, error: cmErr.message });
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

    // 6) Resolver nombres (delegates + clients) con SERVICE ROLE
    stage = "resolve_names";
    const delegateIds = Array.from(
      new Set(delegatesRows.map((r: any) => String(r.beneficiary_id)))
    );
    const recommClientIds = Array.from(
      new Set(recommRows.map((r: any) => String(r.beneficiary_id)))
    );

    const [delegatesRes, clientsRes] = await Promise.all([
      delegateIds.length
        ? admin
            .from("delegates")
            .select("id, name, email, actor_id")
            .in("id", delegateIds)
        : Promise.resolve({ data: [], error: null } as any),

      recommClientIds.length
        ? admin
            .from("clients")
            .select("id, name, contact_email, tax_id")
            .in("id", recommClientIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (delegatesRes?.error) {
      return json(500, {
        ok: false,
        stage: "delegates_select",
        error: delegatesRes.error.message,
      });
    }
    if (clientsRes?.error) {
      return json(500, {
        ok: false,
        stage: "clients_select",
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

    // 7) Actividad: últimas importaciones (RLS; si falla, no rompe)
    stage = "recent_imports";
    let recentImports: any[] = [];
    const { data: ingestaData, error: ingestaErr } = await supaRls
      .from("ingesta_log")
      .select("id, usuario_email, fecha_procesado, num_pdfs, num_ok")
      .order("fecha_procesado", { ascending: false })
      .limit(5);

    if (!ingestaErr && Array.isArray(ingestaData)) recentImports = ingestaData;

    // 8) Respuesta (contractual: state_code sempre present)
    return json(200, {
      ok: true,
      month,
      state_code: monthState.state_code,
      month_state: {
        state_code: monthState.state_code,
        source: monthState.source,
        warning_fallback: monthState.warning_fallback,
        // Row només per diagnòstic; si no existeix, és null (no trenca UI)
        lock_row: monthState.lock_row ?? null,
      },
      actor: {
        id: String(actor.id),
        role: actor.role ?? "unknown",
        name: actor.name ?? actor.email ?? "—",
      },
      warning_actor_missing: false,
      kpi_month: kpi_month ?? null,
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
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}

export async function POST(req: Request) {
  return handle(req);
}
