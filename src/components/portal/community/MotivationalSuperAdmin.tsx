"use client";

/**
 * MotivationalSuperAdmin — CANÒNIC
 * Fonts BD:
 * - invoices + invoice_items: unitats / promo / base neta (mes i YTD)
 * - import_invoice_errors: incidències del mes (count)
 *
 * IMPORTANT:
 * - No heurística: només agreguem dades existents.
 * - Mostrem "sale" i "promotion" segons invoice_items.line_type.
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Kpi = {
  units_sale: number;
  units_promo: number;
  net_sale: number;
};

type State =
  | { status: "loading" }
  | { status: "ok"; month: Kpi; ytd: Kpi; importErrorsThisMonth: number }
  | { status: "error"; message: string };

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function nextMonthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}
function yearStart(d: Date) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function euro(n: number) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n)} €`;
  }
}

function int(n: number) {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export default function MotivationalSuperAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function fetchKpi(rangeStart: Date, rangeEnd: Date): Promise<Kpi> {
      // Join invoice_items -> invoices per filtrar per paid_date i is_paid
      const { data, error } = await supabase
        .from("invoice_items")
        .select("units, line_type, line_net_amount, invoices!inner(paid_date,is_paid)")
        .eq("invoices.is_paid", true)
        .gte("invoices.paid_date", rangeStart.toISOString())
        .lt("invoices.paid_date", rangeEnd.toISOString());

      if (error) throw new Error(error.message);

      let units_sale = 0;
      let units_promo = 0;
      let net_sale = 0;

      for (const row of data || []) {
        const lineType = String((row as any).line_type || "").toLowerCase();
        const units = Number((row as any).units || 0);
        const net = Number((row as any).line_net_amount || 0);

        if (lineType === "sale") {
          units_sale += units;
          net_sale += net;
        } else if (lineType === "promotion") {
          units_promo += units;
        }
      }

      return {
        units_sale: int(units_sale),
        units_promo: int(units_promo),
        net_sale: Number.isFinite(net_sale) ? Math.round(net_sale * 100) / 100 : 0,
      };
    }

    async function fetchImportErrorsCount(rangeStart: Date, rangeEnd: Date): Promise<number> {
      // Count ràpid (head:true)
      const { count, error } = await supabase
        .from("import_invoice_errors")
        .select("id", { count: "exact", head: true })
        .gte("created_at", rangeStart.toISOString())
        .lt("created_at", rangeEnd.toISOString());

      if (error) return 0;
      return count ? int(count) : 0;
    }

    async function run() {
      try {
        const now = new Date();
        const m0 = monthStart(now);
        const m1 = nextMonthStart(now);
        const y0 = yearStart(now);

        const [kpiMonth, kpiYtd, importErrorsThisMonth] = await Promise.all([
          fetchKpi(m0, m1),
          fetchKpi(y0, m1), // YTD fins final del mes actual (coherent amb comparativa)
          fetchImportErrorsCount(m0, m1),
        ]);

        if (cancelled) return;

        setState({
          status: "ok",
          month: kpiMonth,
          ytd: kpiYtd,
          importErrorsThisMonth,
        });
      } catch (e) {
        if (cancelled) return;
        setState({ status: "error", message: e instanceof Error ? e.message : "error" });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (state.status === "loading") {
    return (
      <div className="mt-4 text-sm" style={{ color: "var(--viho-muted)" }}>
        carregant KPI…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mt-4 text-sm" style={{ color: "var(--viho-muted)" }}>
        KPI no disponible.
      </div>
    );
  }

  const { month, ytd, importErrorsThisMonth } = state;

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-primary)" }}>
        IMPULS SUPER_ADMIN
      </div>

      {/* Mes */}
      <div className="mt-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}>
        <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--viho-muted)" }}>
          Aquest mes
        </div>

        <div className="mt-1 text-[15px] font-semibold" style={{ color: "var(--viho-text)" }}>
          <span style={{ color: "var(--viho-gold, #C7AE6A)" }}>{month.units_sale}</span> unitats{" "}
          <span style={{ color: "var(--viho-muted)" }}>·</span>{" "}
          <span style={{ color: "var(--viho-gold, #C7AE6A)" }}>{month.units_promo}</span> FOC{" "}
          <span style={{ color: "var(--viho-muted)" }}>·</span>{" "}
          <span style={{ color: "var(--viho-primary)" }}>{euro(month.net_sale)}</span> net
        </div>

        {importErrorsThisMonth > 0 ? (
          <div className="mt-1 text-[12px]" style={{ color: "var(--viho-muted)" }}>
            Incidències import: <span style={{ color: "var(--viho-primary)" }}>{importErrorsThisMonth}</span>
          </div>
        ) : (
          <div className="mt-1 text-[12px]" style={{ color: "var(--viho-muted)" }}>
            Import: estable ✅
          </div>
        )}
      </div>

      {/* YTD */}
      <div className="mt-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}>
        <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--viho-muted)" }}>
          Any en curs (YTD)
        </div>

        <div className="mt-1 text-[15px] font-semibold" style={{ color: "var(--viho-text)" }}>
          <span style={{ color: "var(--viho-gold, #C7AE6A)" }}>{ytd.units_sale}</span> unitats{" "}
          <span style={{ color: "var(--viho-muted)" }}>·</span>{" "}
          <span style={{ color: "var(--viho-gold, #C7AE6A)" }}>{ytd.units_promo}</span> FOC{" "}
          <span style={{ color: "var(--viho-muted)" }}>·</span>{" "}
          <span style={{ color: "var(--viho-primary)" }}>{euro(ytd.net_sale)}</span> net
        </div>
      </div>
    </div>
  );
}
