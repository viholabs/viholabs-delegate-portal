// src/app/api/control-room/objectives/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

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

function pct(
  actual: number | null | undefined,
  target: number | null | undefined
): number | null {
  const a = typeof actual === "number" && Number.isFinite(actual) ? actual : null;
  const t = typeof target === "number" && Number.isFinite(target) ? target : null;
  if (a === null || t === null) return null;
  if (t <= 0) return null;
  return Math.round((a / t) * 1000) / 10;
}

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaRls } = ar as { actor: any; supaRls: any };

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed = eff.isSuperAdmin || eff.has("objectives.read");
    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (objectives.read)" });
    }

    stage = "parse_body";
    const { month } = (await req.json().catch(() => ({}))) as { month?: string };

    if (!month || !isMonth01(month)) {
      return json(400, {
        ok: false,
        stage,
        error: "Body inválido. Esperado: { month: 'YYYY-MM-01' }",
      });
    }

    const year = Number(String(month).slice(0, 4));

    stage = "targets_monthly";
    const { data: tMonth, error: tMonthErr } = await supaRls
      .from("targets_monthly")
      .select("month, target_units_total, target_delegates_active, notes, updated_at")
      .eq("month", month)
      .maybeSingle();

    if (tMonthErr) {
      return json(500, { ok: false, stage, error: tMonthErr.message });
    }

    // SERVICE ROLE
    const supaService = getServiceSupabase();

    // DIAGNÓSTICO: quién es el usuario/rol en Postgres para este cliente
    stage = "diag:whoami";
    const { data: whoArr, error: whoErr } = await supaService.rpc("sql", {
      // OJO: esta RPC "sql" NO existe normalmente. Si no existe, lo manejamos abajo.
      // La dejamos para detectar si tienes una función utilitaria interna.
      q: "select current_user::text as current_user, session_user::text as session_user",
    } as any);

    const diag =
      whoErr
        ? { note: "No diag RPC 'sql' available", error: whoErr.message }
        : { who: whoArr };

    stage = "rpc:kpi_month_summary_v1";
    const { data: aMonthArr, error: aMonthErr } = await supaService.rpc(
      "kpi_month_summary_v1",
      { p_month: month }
    );

    if (aMonthErr) {
      return json(500, { ok: false, stage, error: aMonthErr.message, diag });
    }

    const aMonth: any = Array.isArray(aMonthArr) ? aMonthArr[0] : aMonthArr;

    stage = "targets_channel_annual";
    const { data: tCh, error: tChErr } = await supaRls
      .from("targets_channel_annual")
      .select("year, profile_type, target_units, active, updated_at")
      .eq("year", year)
      .eq("active", true);

    if (tChErr) {
      return json(500, { ok: false, stage, error: tChErr.message, diag });
    }

    stage = "rpc:kpi_channel_ytd_v1";
    const { data: aCh, error: aChErr } = await supaService.rpc("kpi_channel_ytd_v1", {
      p_month: month,
    });

    if (aChErr) {
      return json(500, { ok: false, stage, error: aChErr.message, diag });
    }

    stage = "maps";
    const targetMap = new Map<string, { label: string; target: number }>();
    for (const r of tCh ?? []) {
      const label = String((r as any).profile_type ?? "").trim() || "SIN_PERFIL";
      const target = toNum((r as any).target_units, 0);
      targetMap.set(normalizeKey(label), { label, target });
    }

    const actualMap = new Map<string, number>();
    for (const r of (aCh ?? []) as any[]) {
      const label = String(r.profile_type ?? "").trim() || "SIN_PERFIL";
      const actual = toNum((r as any).units_total, 0);
      actualMap.set(normalizeKey(label), actual);
    }

    const keys = new Set<string>([...targetMap.keys(), ...actualMap.keys()]);

    const channels_ytd = Array.from(keys).map((k) => {
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

    const tgtUnitsMonth: number = toNum(tMonth?.target_units_total, 0);
    const tgtDelegatesMonth: number | null =
      tMonth?.target_delegates_active == null
        ? null
        : toNum(tMonth.target_delegates_active, 0);

    const actUnitsMonth: number = toNum(aMonth?.units_total, 0);
    const actDelegatesMonth: number | null =
      aMonth?.delegates_count == null ? null : toNum(aMonth.delegates_count, 0);

    const units_delta: number = tgtUnitsMonth - actUnitsMonth;
    const delegates_delta: number | null =
      tgtDelegatesMonth == null || actDelegatesMonth == null
        ? null
        : tgtDelegatesMonth - actDelegatesMonth;

    return json(200, {
      ok: true,
      month,
      year,
      diag,
      actor: {
        id: String(actor.id),
        role: actor.role ?? null,
        name: actor.name ?? actor.email ?? null,
        email: actor.email ?? null,
      },
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
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}

export async function PUT(req: Request) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaRls } = ar as { actor: any; supaRls: any };

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed = eff.isSuperAdmin || eff.has("objectives.manage");
    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (objectives.manage)" });
    }

    stage = "parse_body";
    const body = (await req.json().catch(() => ({}))) as any;

    const month = String(body?.month ?? "");
    if (!month || !isMonth01(month)) {
      return json(400, {
        ok: false,
        stage,
        error: "Body inválido. Esperado: { month: 'YYYY-MM-01', ... }",
      });
    }

    const year = Number(month.slice(0, 4));

    stage = "update:targets_monthly";
    const target_units_total = asNonNegInt(body?.target_units_total);
    const target_delegates_active = asNonNegInt(body?.target_delegates_active);

    const notes =
      body?.notes === null || body?.notes === undefined ? undefined : String(body.notes);

    const patchMonth: any = {};

    if (target_units_total !== null) patchMonth.target_units_total = target_units_total;
    if (body?.target_units_total === null) patchMonth.target_units_total = null;

    if (target_delegates_active !== null)
      patchMonth.target_delegates_active = target_delegates_active;
    if (body?.target_delegates_active === null) patchMonth.target_delegates_active = null;

    if (notes !== undefined) patchMonth.notes = notes;

    if (Object.keys(patchMonth).length > 0) {
      const { error: upMonthErr } = await supaRls
        .from("targets_monthly")
        .update(patchMonth)
        .eq("month", month);

      if (upMonthErr) {
        return json(500, { ok: false, stage, error: upMonthErr.message });
      }
    }

    stage = "update:targets_channel_annual";
    const channels = Array.isArray(body?.channels) ? body.channels : null;

    if (channels) {
      for (const ch of channels) {
        const profile_type = String(ch?.profile_type ?? "").trim();
        const target_units = asNonNegInt(ch?.target_units);
        const active = typeof ch?.active === "boolean" ? ch.active : true;

        if (!profile_type) continue;
        if (target_units === null) continue;

        const { error: upChErr } = await supaRls
          .from("targets_channel_annual")
          .upsert(
            {
              year,
              profile_type,
              target_units,
              active,
            },
            { onConflict: "year,profile_type" }
          );

        if (upChErr) {
          return json(500, { ok: false, stage, error: upChErr.message });
        }
      }
    }

    return json(200, { ok: true, month });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
