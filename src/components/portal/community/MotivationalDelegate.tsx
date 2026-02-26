"use client";

/**
 * MotivationalDelegate — CANÒNIC
 * Fonts:
 * - commission_monthly (mes actual, delegat)
 * - commission_rules_delegates (trams)
 * - delegate_quarterly_progress (bonus trimestral)
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type QuarterProgress = {
  units_in_quarter: number;
  quarterly_goal: number;
  units_below_goal: number;
};

type MonthlyDelegate = {
  units_sale: number;
  units_promotion: number;
  reference_price: number;
  percentage_applied: number;
  base_amount: number;
  commission_amount: number;
  period_month: string; // YYYY-MM-01
};

type RuleRow = {
  delegate_id: string | null;
  from_units: number | null;
  to_units: number | null;
  percentage: number | null;
  reference_price: number | null;
  valid_from: string | null;
  valid_to: string | null;
  year: number | null;
  channel: string | null;
};

function moneyEUR(n: number): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}

function numInt(n: number): string {
  try {
    return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

function monthStartISO(now: Date): string {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function pickCurrentRule(rules: RuleRow[], uid: string, unitsSale: number): RuleRow | null {
  const inRange = rules.filter((r) => {
    const from = Number(r.from_units ?? 0);
    const to = Number(r.to_units ?? 1000000000);
    return unitsSale >= from && unitsSale <= to;
  });
  if (inRange.length === 0) return null;

  inRange.sort((a, b) => {
    const aSpec = a.delegate_id && a.delegate_id === uid ? 1 : 0;
    const bSpec = b.delegate_id && b.delegate_id === uid ? 1 : 0;
    if (aSpec !== bSpec) return bSpec - aSpec;
    return Number(b.from_units ?? 0) - Number(a.from_units ?? 0);
  });

  return inRange[0] || null;
}

function pickNextRule(rules: RuleRow[], uid: string, unitsSale: number): RuleRow | null {
  const next = rules
    .filter((r) => Number(r.from_units ?? 0) > unitsSale)
    .sort((a, b) => {
      const aSpec = a.delegate_id && a.delegate_id === uid ? 1 : 0;
      const bSpec = b.delegate_id && b.delegate_id === uid ? 1 : 0;
      if (aSpec !== bSpec) return bSpec - aSpec;
      return Number(a.from_units ?? 0) - Number(b.from_units ?? 0);
    });

  return next[0] || null;
}

export default function MotivationalDelegate() {
  const supabase = createClient();

  const [uid, setUid] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<MonthlyDelegate | null>(null);
  const [quarter, setQuarter] = useState<QuarterProgress | null>(null);
  const [rules, setRules] = useState<RuleRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data: user } = await supabase.auth.getUser();
      const id = user.user?.id || null;
      if (!id) return;
      if (!cancelled) setUid(id);

      const now = new Date();
      const periodMonth = monthStartISO(now);
      const year = now.getFullYear();
      const channel = "pdv";

      const { data: m, error: mErr } = await supabase
        .from("commission_monthly")
        .select("units_sale, units_promotion, reference_price, percentage_applied, base_amount, commission_amount, period_month")
        .eq("beneficiary_type", "delegate")
        .eq("beneficiary_id", id)
        .eq("period_month", periodMonth)
        .limit(1)
        .maybeSingle();

      if (!cancelled && !mErr && m) {
        setMonthly({
          units_sale: Number((m as any).units_sale || 0),
          units_promotion: Number((m as any).units_promotion || 0),
          reference_price: Number((m as any).reference_price || 0),
          percentage_applied: Number((m as any).percentage_applied || 0),
          base_amount: Number((m as any).base_amount || 0),
          commission_amount: Number((m as any).commission_amount || 0),
          period_month: String((m as any).period_month || periodMonth),
        });
      }

      const { data: q, error: qErr } = await supabase
        .from("delegate_quarterly_progress")
        .select("units_in_quarter, quarterly_goal, units_below_goal")
        .eq("delegate_id", id)
        .order("quarter_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && !qErr && q) {
        setQuarter({
          units_in_quarter: Number((q as any).units_in_quarter || 0),
          quarterly_goal: Number((q as any).quarterly_goal || 0),
          units_below_goal: Number((q as any).units_below_goal || 0),
        });
      }

      const { data: rs, error: rErr } = await supabase
        .from("commission_rules_delegates")
        .select("delegate_id, from_units, to_units, percentage, reference_price, valid_from, valid_to, year, channel")
        .eq("active", true)
        .eq("channel", channel)
        .eq("year", year)
        .or(`delegate_id.is.null,delegate_id.eq.${id}`);

      if (!cancelled && !rErr && Array.isArray(rs)) {
        setRules(rs as any);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (!monthly && !quarter) return null;

  const tier = useMemo(() => {
    if (!uid || !monthly || !rules || rules.length === 0) return null;

    const unitsSale = Math.max(0, monthly.units_sale || 0);
    const current = pickCurrentRule(rules, uid, unitsSale);
    const next = pickNextRule(rules, uid, unitsSale);
    if (!current) return null;

    const pct = Number(current.percentage ?? monthly.percentage_applied ?? 0);
    const ref = Number(current.reference_price ?? monthly.reference_price ?? 0);
    const eurPerUnit = (ref * pct) / 100;

    const line1 = `Aquest mes: ${numInt(monthly.units_sale)} unitats consolidades · ${numInt(
      monthly.units_promotion
    )} FOC · base neta ${moneyEUR(monthly.base_amount)}`;

    let line2 = `Tram actual: ${pct}% (${moneyEUR(eurPerUnit)}/unitat)`;

    if (next && Number(next.from_units ?? 0) > unitsSale) {
      const need = Math.max(0, Number(next.from_units ?? 0) - unitsSale);
      const nextPct = Number(next.percentage ?? 0);
      const nextRef = Number(next.reference_price ?? ref);
      const nextEurPerUnit = (nextRef * nextPct) / 100;

      line2 = `Tram actual: ${pct}% (${moneyEUR(eurPerUnit)}/unitat) · et falten ${numInt(need)} unitats per saltar a ${nextPct}% (${moneyEUR(
        nextEurPerUnit
      )}/unitat)`;
    }

    return { line1, line2 };
  }, [uid, monthly, rules]);

  const bonus = useMemo(() => {
    if (!quarter) return null;

    const goal = Math.max(0, quarter.quarterly_goal || 0);
    const done = Math.max(0, quarter.units_in_quarter || 0);
    const left = Math.max(0, quarter.units_below_goal || 0);

    const headline = left <= 0 ? "BONUS ASSOLIT ✅" : "BONUS ACTIU";
    const line =
      left <= 0
        ? `Trimestre ${numInt(done)} / ${numInt(goal)} unitats · objectiu completat.`
        : `Trimestre ${numInt(done)} / ${numInt(goal)} unitats · només ${numInt(left)} per cobrar-lo.`;

    return { headline, line };
  }, [quarter]);

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-primary)" }}>
        IMPULSO
      </div>

      {tier ? (
        <div
          className="mt-2 rounded-xl px-3 py-3"
          style={{
            border: "1px solid color-mix(in srgb, var(--viho-primary) 18%, transparent)",
            background: "color-mix(in srgb, var(--background) 92%, var(--viho-primary) 8%)",
          }}
        >
          <div className="text-[15px] font-semibold leading-snug" style={{ color: "var(--viho-text)" }}>
            {tier.line1}
          </div>
          <div className="mt-1 text-[13px] leading-snug" style={{ color: "var(--viho-muted)" }}>
            {tier.line2}
          </div>
        </div>
      ) : null}

      {bonus ? (
        <div
          className="mt-2 rounded-xl px-3 py-3"
          style={{
            border: "1px solid color-mix(in srgb, var(--viho-gold, #C7AE6A) 22%, transparent)",
            background: "color-mix(in srgb, var(--background) 90%, var(--viho-gold, #C7AE6A) 10%)",
          }}
        >
          <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-primary)" }}>
            {bonus.headline}
          </div>
          <div className="mt-1 text-[14px] font-medium leading-snug" style={{ color: "var(--viho-text)" }}>
            {bonus.line}
          </div>
        </div>
      ) : null}
    </div>
  );
}
