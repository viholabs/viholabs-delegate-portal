// src/app/api/control-room/objectives/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

type RpcPermRow = { perm_code: string | null };

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
function pct(
  actual: number | null | undefined,
  target: number | null | undefined
): number | null {
  const a = typeof actual === "number" && Number.isFinite(actual) ? actual : null;
  const t = typeof target === "number" && Number.isFinite(target) ? target : null;
  if (a === null || t === null) return null;
  if (t <= 0) return null;
  return Math.round((a / t) * 1000) / 10; // 1 decimal
}

function normalizePermCode(v: any) {
  return String(v ?? "").trim();
}

async function getEffectivePerms(supaService: any, actorId: string) {
  const { data, error } = await supaService.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  if (error) {
    throw new Error(`effective_permissions failed: ${error.message}`);
  }

  const rows = (data ?? []) as RpcPermRow[];
  const codes = rows
    .map((r) => normalizePermCode(r?.perm_code))
    .filter((x) => x.length > 0);

  const isSuperAdmin = codes.includes("*");
  const perms = new Set<string>(codes);

  return {
    isSuperAdmin,
    has: (perm: string) => (isSuperAdmin ? true : perms.has(perm)),
    list: codes,
  };
}

async function audit(supaService: any, payload: any) {
  try {
    await supaService.from("audit_log").insert({
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
  let stage = "init";

  try {
    // 1) Actor + supa clients
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaService, supaRls, authUserId } = ar as {
      actor: any;
      supaService: any;
      supaRls: any;
      authUserId: string | null;
    };

    // 2) Permisos efectivos (RBAC + overrides)
    stage = "effective_permissions";
    const perms = await getEffectivePerms(supaService, String(actor.id));

    // Biblia: permiso canónico para leer objetivos
    stage = "authorize";
    if (!perms.has("objectives.read")) {
      await audit(supaService, {
        user_id: authUserId,
        actor_id: actor.id,
        action: "OBJECTIVES_READ",
        entity: "objectives",
        status: "denied",
        meta: { stage, missing: "objectives.read" },
      });
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (objectives.read)",
      });
    }

    // 3) Body
    stage = "parse_body";
    const { month } = (await req.json().catch(() => ({}))) as { month?: string };
    if (!month || !isMonth01(month)) {
      return json(400, {
        ok: false,
        stage,
        error: "Body inválido. Esperado: { month: 'YYYY-MM-01' }",
      });
    }

    const year = Number(month.slice(0, 4));

    // 4) targets del mes (RLS)
    stage = "targets_monthly";
    const { data: tMonth, error: tMonthErr } = await supaRls
      .from("targets_monthly")
      .select("month, target_units_total, target_delegates_active, notes, updated_at")
      .eq("month", month)
      .maybeSingle();

    if (tMonthErr) {
      return json(500, { ok: false, stage, error: tMonthErr.message });
    }

    // 5) actual del mes (RPC) (RLS)
    stage = "rpc:kpi_month_summary_v1";
    const { data: aMonthArr, error: aMonthErr } = await supaRls.rpc(
      "kpi_month_summary_v1",
      { p_month: month }
    );
    if (aMonthErr) {
      return json(500, { ok: false, stage, error: aMonthErr.message });
    }
    const aMonth: any = Array.isArray(aMonthArr) ? aMonthArr[0] : aMonthArr;

    // 6) targets canal anual (RLS)
    stage = "targets_channel_annual";
    const { data: tCh, error: tChErr } = await supaRls
      .from("targets_channel_annual")
      .select("year, profile_type, target_units, active, updated_at")
      .eq("year", year)
      .eq("active", true);

    if (tChErr) {
      return json(500, { ok: false, stage, error: tChErr.message });
    }

    // 7) actual canal YTD (RPC) (RLS)
    stage = "rpc:kpi_channel_ytd_v1";
    const { data: aCh, error: aChErr } = await supaRls.rpc("kpi_channel_ytd_v1", {
      p_month: month,
    });
    if (aChErr) {
      return json(500, { ok: false, stage, error: aChErr.message });
    }

    // 8) mapas
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

    // Mes: todo convertido a number ANTES de operar
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

    await audit(supaService, {
      user_id: authUserId,
      actor_id: actor.id,
      action: "OBJECTIVES_READ",
      entity: "objectives",
      status: "ok",
      meta: { month },
    });

    return json(200, {
      ok: true,
      month,
      year,
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
    // 1) Actor + supa clients
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const { actor, supaService, supaRls, authUserId } = ar as {
      actor: any;
      supaService: any;
      supaRls: any;
      authUserId: string | null;
    };

    // 2) Permisos efectivos
    stage = "effective_permissions";
    const perms = await getEffectivePerms(supaService, String(actor.id));

    // Biblia: permiso canónico para editar objetivos
    stage = "authorize";
    if (!perms.has("objectives.manage")) {
      await audit(supaService, {
        user_id: authUserId,
        actor_id: actor.id,
        action: "OBJECTIVES_WRITE",
        entity: "objectives",
        status: "denied",
        meta: { stage, missing: "objectives.manage" },
      });

      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (objectives.manage)",
      });
    }

    // 3) Body
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

    // 4) Update targets_monthly
    stage = "update:targets_monthly";
    const target_units_total = asNonNegInt(body?.target_units_total);
    const target_delegates_active = asNonNegInt(body?.target_delegates_active);
    const notes =
      body?.notes === null || body?.notes === undefined ? undefined : String(body.notes);

    // Construimos patch sólo con lo que venga en el body
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

    // 5) Optional: update targets_channel_annual (array)
    // body.channels: [{ profile_type, target_units, active? }]
    stage = "update:targets_channel_annual";
    const channels = Array.isArray(body?.channels) ? body.channels : null;

    if (channels) {
      for (const ch of channels) {
        const profile_type = String(ch?.profile_type ?? "").trim();
        const target_units = asNonNegInt(ch?.target_units);
        const active =
          typeof ch?.active === "boolean" ? ch.active : true;

        if (!profile_type) continue;
        if (target_units === null) continue;

        // upsert por (year, profile_type)
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

    await audit(supaService, {
      user_id: authUserId,
      actor_id: actor.id,
      action: "OBJECTIVES_WRITE",
      entity: "objectives",
      status: "ok",
      meta: { month, updated_month: Object.keys(patchMonth).length > 0, updated_channels: !!channels },
    });

    return json(200, { ok: true, month });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
