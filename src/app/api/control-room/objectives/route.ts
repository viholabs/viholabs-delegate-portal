import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isMonth01(s: string) {
  return /^\d{4}-\d{2}-01$/.test(s);
}

function normalizeKey(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function asNonNegInt(v: any): number | null {
  const n = asInt(v);
  if (n === null) return null;
  return n < 0 ? null : n;
}

/**
 * % tolerante: acepta null/undefined y nunca lanza.
 */
function pct(actual: number | null | undefined, target: number | null | undefined): number | null {
  const a = typeof actual === "number" && Number.isFinite(actual) ? actual : null;
  const t = typeof target === "number" && Number.isFinite(target) ? target : null;
  if (a === null || t === null) return null;
  if (t <= 0) return null;
  return Math.round((a / t) * 1000) / 10; // 1 decimal
}

async function getActorAdminOrThrow(supa: any, userId: string) {
  const { data: actor, error: actorErr } = await supa
    .from("actors")
    .select("id, role, name, email, auth_user_id, status")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (actorErr) {
    return { ok: false, status: 500, stage: "actor:select", error: actorErr.message };
  }

  if (!actor) {
    return {
      ok: false,
      status: 403,
      stage: "actor",
      error: "Actor no encontrado (actors.auth_user_id no vinculado).",
    };
  }

  if (String(actor.status || "").toLowerCase() === "inactive") {
    return { ok: false, status: 403, stage: "actor", error: "Actor inactivo." };
  }

  const role = String(actor.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin" || role === "superadmin";

  if (!isAdmin) {
    return { ok: false, status: 403, stage: "rbac", error: "No autorizado: admin/superadmin." };
  }

  return { ok: true, actor };
}

async function audit(supa: any, payload: any) {
  try {
    await supa.from("audit_log").insert({
      user_id: payload.user_id ?? null,
      actor_id: payload.actor_id ?? null,
      action: payload.action,
      entity: payload.entity,
      entity_id: payload.entity_id ?? null,
      status: payload.status ?? "ok",
      meta: payload.meta ?? {},
    });
  } catch {
    // no bloqueante en MVP
  }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return json(401, { ok: false, error: "Falta Bearer token" });

    const { month } = (await req.json().catch(() => ({}))) as { month?: string };
    if (!month || !isMonth01(month)) {
      return json(400, { ok: false, error: "Body inválido. Esperado: { month: 'YYYY-MM-01' }" });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon || !service) {
      return json(500, { ok: false, stage: "env", error: "Faltan variables Supabase" });
    }

    // 1) validar usuario con token
    const supaAuth = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supaAuth.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json(401, { ok: false, error: "Sesión inválida" });

    // 2) service client (bypass RLS)
    const supa = createClient(url, service, { auth: { persistSession: false } });

    // 3) RBAC
    const actorCheck = await getActorAdminOrThrow(supa, user.id);
    if (!actorCheck.ok) return json(actorCheck.status, actorCheck);
    const actor = actorCheck.actor;

    const year = Number(month.slice(0, 4));

    // 4) targets del mes
    const { data: tMonth, error: tMonthErr } = await supa
      .from("targets_monthly")
      .select("month, target_units_total, target_delegates_active, notes, updated_at")
      .eq("month", month)
      .maybeSingle();

    if (tMonthErr) return json(500, { ok: false, stage: "targets_monthly", error: tMonthErr.message });

    // 5) actual del mes (RPC)
    const { data: aMonthArr, error: aMonthErr } = await supa.rpc("kpi_month_summary_v1", { p_month: month });
    if (aMonthErr) return json(500, { ok: false, stage: "rpc:kpi_month_summary_v1", error: aMonthErr.message });
    const aMonth: any = Array.isArray(aMonthArr) ? aMonthArr[0] : aMonthArr;

    // 6) targets canal anual
    const { data: tCh, error: tChErr } = await supa
      .from("targets_channel_annual")
      .select("year, profile_type, target_units, active, updated_at")
      .eq("year", year)
      .eq("active", true);

    if (tChErr) return json(500, { ok: false, stage: "targets_channel_annual", error: tChErr.message });

    // 7) actual canal YTD (RPC)
    const { data: aCh, error: aChErr } = await supa.rpc("kpi_channel_ytd_v1", { p_month: month });
    if (aChErr) return json(500, { ok: false, stage: "rpc:kpi_channel_ytd_v1", error: aChErr.message });

    // 8) mapas
    const targetMap = new Map<string, { label: string; target: number }>();
    for (const r of tCh ?? []) {
      const label = String((r as any).profile_type ?? "").trim() || "SIN_PERFIL";
      const target = toNum((r as any).target_units, 0);
      targetMap.set(normalizeKey(label), { label, target });
    }

    const actualMap = new Map<string, number>();
    for (const r of (aCh ?? []) as any[]) {
      const label = String(r.profile_type ?? "").trim() || "SIN_PERFIL";
      const actual = toNum(r.units_total, 0);
      actualMap.set(normalizeKey(label), actual);
    }

    const keys = new Set<string>([...targetMap.keys(), ...actualMap.keys()]);

    const channels_ytd = Array.from(keys).map((k) => {
      // ✅ SIN optional chaining en cálculos
      const entry = targetMap.get(k);
      const target: number = entry ? entry.target : 0;
      const label: string = entry ? entry.label : k;
      const actual: number = actualMap.has(k) ? (actualMap.get(k) as number) : 0;

      const remaining_units: number = Math.max(0, target - actual);

      return {
        profile_key: k,
        profile_type: label,
        target_units: target,
        actual_units_ytd: actual,
        progress_pct: pct(actual, target),
        remaining_units,
      };
    });

    channels_ytd.sort((a, b) => (b.target_units || 0) - (a.target_units || 0));

    // ✅ Mes: todo convertido a number ANTES de operar
    const tgtUnitsMonth: number = toNum(tMonth?.target_units_total, 0);
    const tgtDelegatesMonth: number | null =
      tMonth?.target_delegates_active == null ? null : toNum(tMonth.target_delegates_active, 0);

    const actUnitsMonth: number = toNum(aMonth?.units_total, 0);
    const actDelegatesMonth: number | null =
      aMonth?.delegates_count == null ? null : toNum(aMonth.delegates_count, 0);

    const units_delta: number = tgtUnitsMonth - actUnitsMonth;
    const delegates_delta: number | null =
      tgtDelegatesMonth == null || actDelegatesMonth == null ? null : tgtDelegatesMonth - actDelegatesMonth;

    return json(200, {
      ok: true,
      month,
      year,
      actor: { id: actor.id, role: actor.role, name: actor.name, email: actor.email },
      targets_month: {
        target_units_total: tgtUnitsMonth,
        target_delegates_active: tgtDelegatesMonth,
        notes: tMonth?.notes ?? null,
        updated_at: tMonth?.updated_at ?? null,
      },
      actual_month: aMonth ?? null,
      progress_month: {
        units_pct: pct(actUnitsMonth, tgtUnitsMonth),
        units_delta,
        delegates_pct: pct(actDelegatesMonth, tgtDelegatesMonth),
        delegates_delta,
      },
      channels_ytd,
    });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Error inesperado" });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return json(401, { ok: false, error: "Falta Bearer token" });

    const body = (await req.json().catch(() => ({}))) as any;
    const month = String(body?.month ?? "");
    if (!month || !isMonth01(month)) {
      return json(400, { ok: false, error: "Body inválido. Esperado: { month: 'YYYY-MM-01', ... }" });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon || !service) {
      return json(500, { ok: false, stage: "env", error: "Faltan variables Supabase" });
    }

    // validar usuario
    const supaAuth = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supaAuth.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json(401, { ok: false, error: "Sesión inválida" });

    const supa = createClient(url, service, { auth: { persistSession: false } });

    // RBAC
    const actorCheck = await getActorAdminOrThrow(supa, user.id);
    if (!actorCheck.ok) return json(actorCheck.status, actorCheck);
    const actor = actorCheck.actor;

    const year = Number(month.slice(0, 4));

    // targets_month
    const tm = body?.targets_month ?? {};
    const target_units_total = asNonNegInt(tm?.target_units_total);

    const target_delegates_active =
      tm?.target_delegates_active === null || tm?.target_delegates_active === ""
        ? null
        : asNonNegInt(tm?.target_delegates_active);

    if (target_units_total === null) {
      return json(422, { ok: false, stage: "validate:targets_month", error: "target_units_total debe ser entero >= 0" });
    }

    // upsert targets_monthly
    const { error: upMonthErr } = await supa.from("targets_monthly").upsert(
      {
        month,
        target_units_total,
        target_delegates_active,
        notes: tm?.notes ?? null,
      },
      { onConflict: "month" }
    );

    if (upMonthErr) {
      await audit(supa, {
        user_id: user.id,
        actor_id: actor.id,
        action: "targets_monthly_upsert",
        entity: "targets_monthly",
        status: "error",
        meta: { month, error: upMonthErr.message },
      });
      return json(500, { ok: false, stage: "upsert:targets_monthly", error: upMonthErr.message });
    }

    // targets_channel_annual
    const channels = Array.isArray(body?.channels_annual) ? body.channels_annual : [];
    const toUpsert: Array<{ year: number; profile_type: string; target_units: number; active: boolean }> = [];

    for (const row of channels) {
      const label = String(row?.profile_type ?? "").trim();
      if (!label) continue;

      const tuMaybe = asNonNegInt(row?.target_units);
      if (tuMaybe === null) {
        return json(422, {
          ok: false,
          stage: "validate:channels_annual",
          error: `target_units inválido para canal "${label}" (entero >= 0)`,
        });
      }

      // ✅ fuerza a number (evita number|undefined)
      const tu: number = tuMaybe;

      toUpsert.push({
        year,
        profile_type: label,
        target_units: tu,
        active: true,
      });
    }

    if (toUpsert.length > 0) {
      const { error: upChErr } = await supa.from("targets_channel_annual").upsert(toUpsert, {
        onConflict: "year,profile_type",
      });

      if (upChErr) {
        await audit(supa, {
          user_id: user.id,
          actor_id: actor.id,
          action: "targets_channel_annual_upsert",
          entity: "targets_channel_annual",
          status: "error",
          meta: { year, error: upChErr.message },
        });

        return json(500, { ok: false, stage: "upsert:targets_channel_annual", error: upChErr.message });
      }
    }

    await audit(supa, {
      user_id: user.id,
      actor_id: actor.id,
      action: "objectives_saved",
      entity: "objectives",
      status: "ok",
      meta: {
        month,
        year,
        saved: {
          targets_month: { target_units_total, target_delegates_active },
          channels_count: toUpsert.length,
        },
      },
    });

    return json(200, { ok: true, month, year });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Error inesperado" });
  }
}
