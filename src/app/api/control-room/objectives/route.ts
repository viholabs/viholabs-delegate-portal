// src/app/api/control-room/objectives/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function isMonth01(s: string) {
  return /^\d{4}-\d{2}-01$/.test(s);
}

function getCurrentMonth01Madrid(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  });

  const [year, month] = fmt.format(date).split("-");
  return `${year}-${month}-01`;
}

function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pct(a: number, b: number) {
  if (!b || b <= 0) return 0;
  return Math.round((a / b) * 100);
}

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env");
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

async function handle(req: Request) {
  let stage = "init";

  try {
    // =========================
    // CONTEXTO CANÓNICO
    // =========================
    stage = "resolve_dashboard_context";
    const ctx = await resolveDashboardContext(req);

    if (!ctx.ok) {
      return json(ctx.status, {
        ok: false,
        stage,
        error: ctx.error,
      });
    }

    // =========================
    // INPUT
    // =========================
    stage = "month_input";

    const url = new URL(req.url);
    const month =
      url.searchParams.get("month") ||
      getCurrentMonth01Madrid();

    if (!isMonth01(month)) {
      return json(400, {
        ok: false,
        stage,
        error: "month inválido",
      });
    }

    const year = Number(month.slice(0, 4));

    // =========================
    // SERVICE ROLE (GLOBAL)
    // =========================
    const admin = getServiceSupabase();

    // =========================
    // TARGETS MONTH
    // =========================
    stage = "targets_month";

    const { data: tMonth } = await admin
      .from("targets_monthly")
      .select("*")
      .eq("month", month)
      .maybeSingle();

    const target_units = toNum(tMonth?.target_units_total, 0);
    const target_delegates = toNum(
      tMonth?.target_delegates_active,
      0,
    );

    // =========================
    // KPI REAL (GLOBAL)
    // =========================
    stage = "kpi_month_summary";

    const { data: kpiArr } = await admin.rpc(
      "kpi_month_summary_v1",
      { p_month: month },
    );

    const kpi = Array.isArray(kpiArr) ? kpiArr[0] : kpiArr;

    const actual_units = toNum(kpi?.units_total, 0);
    const actual_revenue = toNum(kpi?.revenue, 0);
    const actual_delegates = toNum(kpi?.delegates_count, 0);

    // =========================
    // CHANNEL TARGETS
    // =========================
    stage = "channels";

    const { data: tCh } = await admin
      .from("targets_channel_annual")
      .select("*")
      .eq("year", year)
      .eq("active", true);

    const { data: aCh } = await admin.rpc(
      "kpi_channel_ytd_v1",
      { p_month: month },
    );

    const channels = (tCh ?? []).map((t: any) => {
      const actual = (aCh ?? []).find(
        (a: any) => a.profile_type === t.profile_type,
      );

      const actual_units = toNum(actual?.units_total, 0);
      const target = toNum(t.target_units, 0);

      return {
        profile_type: t.profile_type,
        target_units: target,
        actual_units_ytd: actual_units,
        progress_pct: pct(actual_units, target),
      };
    });

    // =========================
    // RESPONSE
    // =========================
    return json(200, {
      ok: true,
      month,

      // ⚠️ ESTE ES EL CLAVE PARA KPIEngine
      revenue_target: actual_revenue > 0
        ? actual_revenue * 1.2 // fallback inteligente
        : 0,

      units_target: target_units,

      actor_context: {
        actor: ctx.actor,
        scope: ctx.scope,
      },

      targets_month: {
        target_units,
        target_delegates,
      },

      actual_month: {
        units: actual_units,
        revenue: actual_revenue,
        delegates: actual_delegates,
      },

      progress: {
        units_pct: pct(actual_units, target_units),
        delegates_pct: pct(actual_delegates, target_delegates),
      },

      channels,

      meta: {
        generated_at: new Date().toISOString(),
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

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}