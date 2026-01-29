"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** =========================
 * Types
 * ========================= */

type DelegateSummary = {
  ok: boolean;
  month: string;
  mode?: "self" | "supervision";
  actor?: { id: string; role: string; name: string; email: string | null };
  delegate?: {
    id: string;
    name: string;
    email: string | null;
    created_at?: string | null;
  };

  totals?: {
    invoices_paid: number;
    invoices_unpaid: number;
    units_sale_paid: number;
    units_sale_unpaid: number;
    units_sale_total: number;
    units_foc_paid: number;
    units_foc_unpaid: number;
    units_foc_total: number;
  };

  commission?: {
    method: string;
    units_sale_paid: number;
    reference_price: number;
    base_amount: number;
    percentage_applied: number | null;

    commission_amount: number; // BRUTA
    net_amount?: number; // NETA
    deductions_total?: number;
    deductions_lines?: Array<{
      recommender_client_id: string;
      recommender_name: string;
      referred_client_id: string;
      referred_client_name: string;
      mode: "deduct" | "additive";
      percentage: number;
      units_sale_paid: number;
      base_amount: number;
      amount: number;
    }>;

    note?: string;

    tier?: {
      current_pct: number;
      next_pct: number | null;
      units_to_next: number | null;
    };
  };

  bonus?: {
    scheme: string;
    quarterly_bonus: number;
    annual_cap: number;
    current_quarter: number;
    quarter_start: string;
    quarter_end: string;
    objective_units: number;
    units_sale_paid_in_quarter: number;
    remaining_units: number;
    status: "alcanzado" | "pendiente";
    warning_end_t3: boolean;
    warning_message: string | null;
  };

  invoices?: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string | null;
    client_name: string;
    is_paid: boolean;
    units_sale: number;
    units_foc: number;
    total_net: number | null;
    total_gross: number | null;
  }>;

  stage?: string;
  error?: string;
};

type CommercialDashboard = {
  ok: boolean;
  month: string;
  mode?: "self" | "supervision";
  top_clients: Array<{
    id: string;
    name: string;
    units_sale_paid: number;
    base_paid: number;
    invoices_paid: number;
    last_invoice_date: string | null;
  }>;
  recommender_tree: Array<{
    id: string;
    mode: "deduct" | "additive";
    percentage: number;
    recommender: { id: string; name: string };
    referred: { id: string; name: string };
    month_sales: {
      units_sale_paid: number;
      base_paid: number;
      impact_amount: number;
    };
  }>;
  sleeping_clients: Array<{
    client: { id: string; name: string; contact_email: string | null };
    days_since_last: number;
    last_units: number | null;
    severity: "warn" | "risk" | "critical";
  }>;
};

/** =========================
 * Helpers
 * ========================= */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function getDefaultMonth01() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function yyyymmFromMonth01(month01: string) {
  if (!/^\d{4}-\d{2}-01$/.test(month01)) return "";
  return month01.slice(0, 7);
}

function month01FromYYYYMM(yyyymm: string) {
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return getDefaultMonth01();
  return `${yyyymm}-01`;
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function formatInt(n: number) {
  try {
    return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(
      n
    );
  } catch {
    return String(n);
  }
}

function formatMoneyEUR(n: number) {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** “Marcador” (gauge) simple */
function Gauge({
  label,
  valueText,
  subText,
  progress01,
}: {
  label: string;
  valueText: string;
  subText?: string;
  progress01: number;
}) {
  const p = Math.round(clamp01(progress01) * 100);
  const bg = `conic-gradient(#f28444 ${p}%, rgba(89,49,60,0.10) ${p}% 100%)`;

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative h-16 w-16 rounded-full"
        style={{ background: bg }}
        aria-label={`${label} ${p}%`}
      >
        <div
          className="absolute inset-[6px] rounded-full"
          style={{
            background: "white",
            border: "1px solid rgba(89,49,60,0.12)",
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center text-xs font-semibold"
          style={{ color: "#59313c" }}
        >
          {p}%
        </div>
      </div>

      <div className="min-w-0">
        <div
          className="text-xs uppercase tracking-wider"
          style={{ color: "rgba(89,49,60,0.7)" }}
        >
          {label}
        </div>
        <div
          className="text-lg font-semibold leading-tight"
          style={{ color: "#111827" }}
        >
          {valueText}
        </div>
        {subText ? (
          <div
            className="text-xs mt-0.5"
            style={{ color: "rgba(17,24,39,0.65)" }}
          >
            {subText}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** =========================
 * Page
 * ========================= */

export default function DelegateDashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const month01 = useMemo(() => {
    const m = sp.get("month");
    return m && /^\d{4}-\d{2}-01$/.test(m) ? m : getDefaultMonth01();
  }, [sp]);

  const yyyymm = useMemo(() => yyyymmFromMonth01(month01), [month01]);
  const delegateId = useMemo(() => sp.get("delegateId") || "", [sp]);

  const [data, setData] = useState<DelegateSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comercial (Top/Reco/Dormidos)
  const [commercial, setCommercial] = useState<CommercialDashboard | null>(
    null
  );
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [commercialError, setCommercialError] = useState<string | null>(null);

  async function getTokenOrRedirect(): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) {
      const nextUrl = delegateId
        ? `/delegate/dashboard?delegateId=${encodeURIComponent(
            delegateId
          )}&month=${encodeURIComponent(month01)}`
        : `/delegate/dashboard?month=${encodeURIComponent(month01)}`;
      router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
      return null;
    }
    return token;
  }

  async function loadSummary() {
    setLoading(true);
    setError(null);

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const res = await fetch("/api/delegate/summary", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          month: month01,
          delegate_id: delegateId ? delegateId : null,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | DelegateSummary
        | null;

      if (!res.ok || !json?.ok) {
        setData(json);
        setError(json?.error ?? `Error (${res.status})`);
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function loadCommercial() {
    setCommercialLoading(true);
    setCommercialError(null);

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const res = await fetch("/api/delegate/commercial", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          month: month01,
          delegate_id: delegateId ? delegateId : null,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | CommercialDashboard
        | any;

      if (!res.ok || !json?.ok) {
        setCommercial(null);
        setCommercialError(json?.error ?? `Error (${res.status})`);
      } else {
        setCommercial(json);
      }
    } catch (e: any) {
      setCommercial(null);
      setCommercialError(e?.message ?? "Error inesperado");
    } finally {
      setCommercialLoading(false);
    }
  }

  async function loadAll() {
    await Promise.all([loadSummary(), loadCommercial()]);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month01, delegateId]);

  const totals = data?.totals;

  const unitsSalePaid = totals?.units_sale_paid ?? 0;
  const unitsSaleUnpaid = totals?.units_sale_unpaid ?? 0;
  const unitsFocTotal = totals?.units_foc_total ?? 0;
  const unitsTotal =
    (totals?.units_sale_total ?? 0) + (totals?.units_foc_total ?? 0);
  const invoicesUnpaid = totals?.invoices_unpaid ?? 0;

  const commission = data?.commission ?? null;

  const commissionGross = commission?.commission_amount ?? 0;
  const commissionNet = commission?.net_amount ?? commissionGross;
  const deductionsTotal = commission?.deductions_total ?? 0;

  const commissionBase = commission?.base_amount ?? 0;
  const commissionPct = commission?.percentage_applied ?? null;
  const referencePrice = commission?.reference_price ?? 31;

  const eurPerUnitNow =
    commissionPct == null ? 0 : (referencePrice * commissionPct) / 100;

  const tier = commission?.tier ?? null;
  const nextPct = tier?.next_pct ?? null;
  const unitsToNext = tier?.units_to_next ?? null;
  const eurPerUnitNext =
    nextPct == null ? null : (referencePrice * nextPct) / 100;

  // Progreso “tramo”: si conocemos units_to_next, hacemos un termómetro (aprox)
  const tierProgress = useMemo(() => {
    if (unitsToNext == null) return 0;
    const denom = Math.max(unitsSalePaid + unitsToNext, 1);
    return clamp01(unitsSalePaid / denom);
  }, [unitsSalePaid, unitsToNext]);

  // BONUS / OBJETIVO (trimestre desde alta => T1..)
  const bonus = data?.bonus ?? null;
  const objectiveUnits = bonus?.objective_units ?? 0;
  const quarterUnits = bonus?.units_sale_paid_in_quarter ?? 0;
  const remainingUnits = bonus?.remaining_units ?? 0;
  const objectiveProgress =
    objectiveUnits > 0 ? clamp01(quarterUnits / objectiveUnits) : 0;

  // Deducciones: top 3 líneas (si existen)
  const topDeductions = (commission?.deductions_lines ?? [])
    .filter((x) => x.mode === "deduct")
    .slice()
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, 3);

  // Header name
  const delegateName = data?.delegate?.name ?? data?.actor?.name ?? "Delegado";

  // KPI Cards (grid 6)
  const kpiCards: Array<{
    title: string;
    value: string;
    sub: string;
    badge: React.ReactNode | null;
  }> = [
    {
      title: "Unidades totales",
      value: formatInt(unitsTotal),
      sub: `${formatInt(totals?.units_sale_total ?? 0)} venta · ${formatInt(
        unitsFocTotal
      )} bonus (FOC)`,
      badge: null,
    },
    {
      title: "Unidades venta (cobradas)",
      value: formatInt(unitsSalePaid),
      sub: "Generan comisión",
      badge: <Badge>Pagables</Badge>,
    },
    {
      title: "Unidades venta (pendientes)",
      value: formatInt(unitsSaleUnpaid),
      sub: "En seguimiento (no liquidan)",
      badge:
        invoicesUnpaid > 0 ? (
          <Badge variant="warning">Atención</Badge>
        ) : (
          <Badge variant="success">OK</Badge>
        ),
    },
    {
      title: "Bonus (FOC)",
      value: formatInt(unitsFocTotal),
      sub: "Incentivo · fuera de objetivo",
      badge: <Badge variant="default">FOC</Badge>,
    },
    {
      title: "Comisión del mes",
      value: formatMoneyEUR(commissionNet),
      sub:
        commissionPct === null
          ? `Base: ${formatInt(unitsSalePaid)} uds × ${formatMoneyEUR(
              referencePrice
            )}`
          : `Base: ${formatMoneyEUR(commissionBase)} · ${commissionPct}%`,
      badge: <Badge variant="success">Neta</Badge>,
    },
    {
      title: "Objetivo (T1) y tramo",
      value: bonus
        ? `${formatInt(quarterUnits)} / ${formatInt(objectiveUnits)} uds`
        : "—",
      sub: bonus
        ? remainingUnits === 0
          ? "Objetivo alcanzado ✅"
          : `Te faltan ${formatInt(remainingUnits)} uds para el bonus`
        : "Objetivos no disponibles",
      badge: bonus ? (
        bonus.status === "alcanzado" ? (
          <Badge variant="success">OK</Badge>
        ) : (
          <Badge variant="warning">En curso</Badge>
        )
      ) : (
        <Badge variant="default">MVP</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div
            className="text-xs uppercase tracking-widest"
            style={{ color: "rgba(89,49,60,0.7)" }}
          >
            VIHOLABS · DELEGADOS
          </div>

          <h1
            className="mt-1 text-3xl font-semibold tracking-tight"
            style={{ color: "#59313c" }}
          >
            Cuadro de Mando del Delegado
          </h1>

          <div
            className="mt-2 flex flex-wrap items-center gap-2 text-sm"
            style={{ color: "rgba(17,24,39,0.7)" }}
          >
            <span className="font-semibold" style={{ color: "#111827" }}>
              {delegateName}
            </span>
            <span>·</span>
            <span>Periodo:</span>
            <span className="font-mono">{month01}</span>
            <Badge title="Regla">Comisión solo sobre venta cobrada</Badge>
            <Badge title="Regla">FOC no es deuda</Badge>
            {data?.mode === "supervision" ? (
              <Badge variant="warning">Modo supervisión</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="rounded-2xl border px-3 py-2"
            style={{
              borderColor: "rgba(89,49,60,0.15)",
              background: "rgba(217,194,186,0.18)",
            }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "rgba(89,49,60,0.7)" }}
            >
              Mes
            </div>
            <input
              type="month"
              value={yyyymm}
              onChange={(e) => {
                const next = month01FromYYYYMM(e.target.value);
                const q = new URLSearchParams();
                q.set("month", next);
                if (delegateId) q.set("delegateId", delegateId);
                router.push(`/delegate/dashboard?${q.toString()}`);
              }}
              className="mt-1 w-[150px] bg-transparent text-sm outline-none"
              style={{ color: "#111827" }}
            />
          </div>

          <Button
            variant="outline"
            onClick={async () => {
              setReloading(true);
              await loadAll();
              setReloading(false);
            }}
            disabled={loading || reloading || commercialLoading}
          >
            {reloading ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>
      </div>

      {/* Error summary */}
      {error ? (
        <Card>
          <CardContent className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm">{error}</div>
              {data?.stage ? (
                <div
                  className="mt-1 text-xs"
                  style={{ color: "rgba(17,24,39,0.6)" }}
                >
                  Stage: <span className="font-mono">{data.stage}</span>
                </div>
              ) : null}
            </div>
            <Badge variant="danger">ERROR</Badge>
          </CardContent>
        </Card>
      ) : null}

      {/* TABLERO KPI */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        {kpiCards.map((c) => (
          <Card
            key={c.title}
            className={
              c.title === "Objetivo (T1) y tramo"
                ? "lg:col-span-2"
                : "lg:col-span-1"
            }
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle>{c.title}</CardTitle>
              {c.badge}
            </CardHeader>

            <CardContent>
              <div
                className="text-3xl font-semibold tracking-tight"
                style={{ color: "#59313c" }}
              >
                {c.value}
              </div>

              <div
                className="mt-2 text-sm"
                style={{ color: "rgba(17,24,39,0.65)" }}
              >
                {c.sub}
              </div>

              {/* ====== SALPICADERO: comisión (detalles motivadores) ====== */}
              {c.title === "Comisión del mes" ? (
                <div className="mt-4 space-y-3">
                  {/* Neto vs Bruto */}
                  <div className="grid grid-cols-1 gap-3">
                    <Gauge
                      label="Comisión neta"
                      valueText={formatMoneyEUR(commissionNet)}
                      subText={`Bruta ${formatMoneyEUR(
                        commissionGross
                      )} · Deducción recos ${formatMoneyEUR(deductionsTotal)}`}
                      progress01={
                        commissionGross > 0
                          ? clamp01(commissionNet / commissionGross)
                          : 0
                      }
                    />
                  </div>

                  {/* Tramo: falta para saltar */}
                  <div
                    className="rounded-xl border p-3"
                    style={{ borderColor: "rgba(89,49,60,0.12)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "rgba(89,49,60,0.75)" }}
                      >
                        Tramo de comisión
                      </div>
                      {unitsToNext != null ? (
                        <Badge variant="warning">
                          {formatInt(unitsToNext)} uds para subir
                        </Badge>
                      ) : (
                        <Badge variant="default">MVP</Badge>
                      )}
                    </div>

                    <div className="mt-2">
                      <div
                        className="flex items-center justify-between text-xs"
                        style={{ color: "rgba(17,24,39,0.65)" }}
                      >
                        <span>Progreso a siguiente tramo</span>
                        <span>
                          {unitsToNext != null
                            ? `${Math.round(tierProgress * 100)}%`
                            : "—"}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width:
                              unitsToNext != null
                                ? `${Math.round(tierProgress * 100)}%`
                                : "0%",
                            backgroundColor: "#59313c",
                          }}
                        />
                      </div>

                      <div
                        className="mt-2 text-xs"
                        style={{ color: "rgba(17,24,39,0.62)" }}
                      >
                        Ahora:{" "}
                        <b>
                          {commissionPct != null ? `${commissionPct}%` : "—"}
                        </b>{" "}
                        {commissionPct != null
                          ? `(${formatMoneyEUR(eurPerUnitNow)} / ud)`
                          : ""}
                        {nextPct != null && eurPerUnitNext != null ? (
                          <>
                            {" "}
                            · Si subes: <b>{nextPct}%</b> (
                            {formatMoneyEUR(eurPerUnitNext)} / ud)
                          </>
                        ) : (
                          <>
                            {" "}
                            ·{" "}
                            <span style={{ color: "rgba(17,24,39,0.55)" }}>
                              (Define tramos para mostrar salto real)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Top deducciones */}
                  {topDeductions.length > 0 ? (
                    <div
                      className="rounded-xl border p-3"
                      style={{ borderColor: "rgba(89,49,60,0.12)" }}
                    >
                      <div
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "rgba(89,49,60,0.75)" }}
                      >
                        Deducciones por recomendadores (top)
                      </div>
                      <div className="mt-2 space-y-2">
                        {topDeductions.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div
                                className="text-sm font-medium"
                                style={{ color: "#111827" }}
                              >
                                {d.recommender_name}{" "}
                                <span style={{ color: "rgba(17,24,39,0.55)" }}>
                                  →
                                </span>{" "}
                                <span className="font-normal">
                                  {d.referred_client_name}
                                </span>
                              </div>
                              <div
                                className="text-xs"
                                style={{ color: "rgba(17,24,39,0.65)" }}
                              >
                                {formatInt(d.units_sale_paid)} uds cobradas ·{" "}
                                {d.percentage}% · Base{" "}
                                {formatMoneyEUR(d.base_amount)}
                              </div>
                            </div>
                            <div
                              className="text-sm font-semibold"
                              style={{ color: "#59313c" }}
                            >
                              -{formatMoneyEUR(d.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* ====== SALPICADERO: Objetivo T1 y bonus ====== */}
              {c.title === "Objetivo (T1) y tramo" ? (
                <div className="mt-4 space-y-4">
                  <div
                    className="rounded-xl border p-3"
                    style={{ borderColor: "rgba(89,49,60,0.12)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "rgba(89,49,60,0.75)" }}
                      >
                        Objetivo trimestral (T{bonus?.current_quarter ?? "—"})
                      </div>
                      {bonus ? (
                        <Badge
                          variant={bonus.status === "alcanzado" ? "success" : "warning"}
                        >
                          {Math.round(objectiveProgress * 100)}%
                        </Badge>
                      ) : (
                        <Badge variant="default">—</Badge>
                      )}
                    </div>

                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.round(objectiveProgress * 100)}%`,
                          backgroundColor: "#f28444",
                        }}
                      />
                    </div>

                    {bonus ? (
                      <div
                        className="mt-2 text-xs"
                        style={{ color: "rgba(17,24,39,0.62)" }}
                      >
                        Ventana:{" "}
                        <span className="font-mono">{bonus.quarter_start}</span>{" "}
                        → <span className="font-mono">{bonus.quarter_end}</span>
                        <br />
                        Bonus: <b>{formatMoneyEUR(bonus.quarterly_bonus)}</b> ·
                        Te faltan <b>{formatInt(bonus.remaining_units)}</b> uds
                        <br />
                        <span style={{ color: "rgba(17,24,39,0.55)" }}>
                          (Cuenta SOLO venta cobrada · FOC/promo fuera del
                          objetivo)
                        </span>
                      </div>
                    ) : (
                      <div
                        className="mt-2 text-xs"
                        style={{ color: "rgba(17,24,39,0.55)" }}
                      >
                        Objetivos no disponibles (MVP).
                      </div>
                    )}
                  </div>

                  {bonus?.warning_end_t3 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {bonus.warning_message ??
                        "Fin de T3: revisar objetivos para el siguiente año."}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Nota comisión pequeña */}
              {c.title === "Comisión del mes" ? (
                <div
                  className="mt-2 text-xs"
                  style={{ color: "rgba(17,24,39,0.6)" }}
                >
                  Precio ref:{" "}
                  <span className="font-mono">
                    {formatMoneyEUR(referencePrice)}
                  </span>{" "}
                  · % <span className="font-mono">{commissionPct ?? "—"}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Avisos */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Avisos</CardTitle>
            <div
              className="mt-1 text-sm"
              style={{ color: "rgba(17,24,39,0.65)" }}
            >
              Pendientes de cobro (preparado para vencimiento)
            </div>
          </div>
          {invoicesUnpaid > 0 ? (
            <Badge variant="warning">Atención</Badge>
          ) : (
            <Badge variant="success">OK</Badge>
          )}
        </CardHeader>
        <CardContent>
          {invoicesUnpaid > 0 ? (
            <div className="text-sm" style={{ color: "#111827" }}>
              Hay <b>{formatInt(invoicesUnpaid)}</b> facturas pendientes de
              cobro. La comisión de esas ventas queda en espera.
            </div>
          ) : (
            <div className="text-sm" style={{ color: "#111827" }}>
              No hay facturas pendientes de cobro en este periodo.
            </div>
          )}
          <div className="mt-2 text-xs" style={{ color: "rgba(17,24,39,0.6)" }}>
            Nota: los bonus (FOC) no se consideran pendientes y no generan
            comisión.
          </div>
        </CardContent>
      </Card>

      {/* Tabla facturas */}
      <Card>
        <CardHeader>
          <CardTitle>Facturas del mes</CardTitle>
          <div
            className="mt-1 text-sm"
            style={{ color: "rgba(17,24,39,0.65)" }}
          >
            Vista por factura · separando venta vs bonus (FOC)
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Venta (uds)</TableHead>
                <TableHead className="text-right">FOC (uds)</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Impacto</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {(data?.invoices ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-sm"
                    style={{ color: "rgba(17,24,39,0.65)" }}
                  >
                    {loading ? "Cargando…" : "— Sin facturas en este periodo —"}
                  </TableCell>
                </TableRow>
              ) : (
                (data?.invoices ?? []).map((r) => {
                  const impact = r.is_paid && r.units_sale > 0 ? "Comisión" : "—";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.invoice_number}</TableCell>
                      <TableCell>{fmtDate(r.invoice_date)}</TableCell>
                      <TableCell>{r.client_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatInt(r.units_sale)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatInt(r.units_foc)}
                      </TableCell>
                      <TableCell>
                        {r.is_paid ? (
                          <Badge variant="success">Cobrada</Badge>
                        ) : (
                          <Badge variant="warning">Pendiente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={impact === "Comisión" ? "success" : "default"}>
                          {impact}
                        </Badge>
                        <div
                          className="mt-1 text-[11px]"
                          style={{ color: "rgba(17,24,39,0.6)" }}
                        >
                          Neto:{" "}
                          {r.total_net != null
                            ? formatMoneyEUR(Number(r.total_net))
                            : "—"}{" "}
                          · Bruto:{" "}
                          {r.total_gross != null
                            ? formatMoneyEUR(Number(r.total_gross))
                            : "—"}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs" style={{ color: "rgba(17,24,39,0.6)" }}>
            Preparado para fase 2: vencimiento (due_date) + alertas automáticas
            por retraso.
          </div>
        </CardContent>
      </Card>

      {/* ================================
          ACCIÓN COMERCIAL (REAL)
      ================================= */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Acción comercial</CardTitle>
            <div
              className="mt-1 text-sm"
              style={{ color: "rgba(17,24,39,0.65)" }}
            >
              Top 5 clientes · Recomendadores · Clientes dormidos
            </div>
          </div>
          {commercialLoading ? (
            <Badge variant="default">Cargando</Badge>
          ) : commercialError ? (
            <Badge variant="warning">Atención</Badge>
          ) : (
            <Badge variant="success">OK</Badge>
          )}
        </CardHeader>

        <CardContent>
          {commercialLoading ? (
            <div className="text-sm" style={{ color: "rgba(17,24,39,0.65)" }}>
              Cargando información comercial…
            </div>
          ) : commercialError ? (
            <div className="text-sm text-red-600">
              {commercialError}
              <div className="mt-2 text-xs" style={{ color: "rgba(17,24,39,0.6)" }}>
                Si aún no tienes el endpoint /api/delegate/commercial, créalo y este bloque se llenará solo.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Top 5 */}
              <div className="rounded-xl border p-4" style={{ borderColor: "rgba(89,49,60,0.12)" }}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold" style={{ color: "#59313c" }}>
                    🏆 Top 5 clientes
                  </div>
                  <Badge variant="default">Mes</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {(commercial?.top_clients ?? []).length === 0 ? (
                    <div className="text-sm" style={{ color: "rgba(17,24,39,0.65)" }}>
                      — Sin datos —
                    </div>
                  ) : (
                    (commercial?.top_clients ?? []).map((c, idx) => (
                      <div key={c.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium" style={{ color: "#111827" }}>
                            {idx + 1}. {c.name}
                          </div>
                          <div className="text-xs" style={{ color: "rgba(17,24,39,0.65)" }}>
                            {formatInt(c.units_sale_paid)} uds · {formatMoneyEUR(c.base_paid)} · {c.invoices_paid} fact.
                          </div>
                        </div>
                        <div className="text-xs font-mono" style={{ color: "rgba(17,24,39,0.65)" }}>
                          {c.last_invoice_date ? fmtDate(c.last_invoice_date) : "—"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recomendadores */}
              <div className="rounded-xl border p-4" style={{ borderColor: "rgba(89,49,60,0.12)" }}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold" style={{ color: "#59313c" }}>
                    🤝 Recomendadores
                  </div>
                  <Badge variant="default">Impacto</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {(commercial?.recommender_tree ?? []).length === 0 ? (
                    <div className="text-sm" style={{ color: "rgba(17,24,39,0.65)" }}>
                      — Sin relaciones —
                    </div>
                  ) : (
                    (commercial?.recommender_tree ?? []).slice(0, 6).map((r) => (
                      <div key={r.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium" style={{ color: "#111827" }}>
                            {r.recommender.name}{" "}
                            <span style={{ color: "rgba(17,24,39,0.55)" }}>→</span>{" "}
                            {r.referred.name}
                          </div>
                          <div className="text-xs" style={{ color: "rgba(17,24,39,0.65)" }}>
                            {formatInt(r.month_sales.units_sale_paid)} uds · {r.percentage}% · Base{" "}
                            {formatMoneyEUR(r.month_sales.base_paid)}
                          </div>
                        </div>
                        <div
                          className="text-sm font-semibold"
                          style={{ color: r.mode === "deduct" ? "#59313c" : "#111827" }}
                        >
                          {r.mode === "deduct" ? "-" : "+"}
                          {formatMoneyEUR(r.month_sales.impact_amount)}
                        </div>
                      </div>
                    ))
                  )}
                  {(commercial?.recommender_tree ?? []).length > 6 ? (
                    <div className="text-xs mt-2" style={{ color: "rgba(17,24,39,0.6)" }}>
                      Mostrando 6 · (fase 2: ver todos + drilldown)
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Dormidos */}
              <div className="rounded-xl border p-4" style={{ borderColor: "rgba(89,49,60,0.12)" }}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold" style={{ color: "#59313c" }}>
                    😴 Clientes dormidos
                  </div>
                  <Badge variant="default">Llamar</Badge>
                </div>

                <div className="mt-3 space-y-2">
                  {(commercial?.sleeping_clients ?? []).length === 0 ? (
                    <div className="text-sm" style={{ color: "rgba(17,24,39,0.65)" }}>
                      — Ninguno —
                    </div>
                  ) : (
                    (commercial?.sleeping_clients ?? []).slice(0, 6).map((s) => (
                      <div key={s.client.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium" style={{ color: "#111827" }}>
                            {s.client.name}
                          </div>
                          <div className="text-xs" style={{ color: "rgba(17,24,39,0.65)" }}>
                            {formatInt(s.days_since_last)} días sin pedido
                            {s.client.contact_email ? ` · ${s.client.contact_email}` : ""}
                          </div>
                        </div>
                        <Badge
                          variant={
                            s.severity === "critical"
                              ? "danger"
                              : s.severity === "risk"
                              ? "warning"
                              : "default"
                          }
                        >
                          {s.severity}
                        </Badge>
                      </div>
                    ))
                  )}
                  {(commercial?.sleeping_clients ?? []).length > 6 ? (
                    <div className="text-xs mt-2" style={{ color: "rgba(17,24,39,0.6)" }}>
                      Mostrando 6 · (fase 2: lista completa + acciones)
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
