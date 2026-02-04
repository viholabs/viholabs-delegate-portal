"use client";

import { useEffect, useMemo, useState } from "react";
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

type MonthSummary = {
  ok: boolean;
  month: string;
  actor?: { id: string | null; role: string; name: string };
  warning_actor_missing?: boolean;

  kpi_month?: {
    month: string;
    invoices_paid_count: number;
    clients_count: number;
    delegates_count: number;
    units_sale: number;
    units_promotion: number;
    units_total: number;
    total_net: number;
    total_vat: number;
    total_gross: number;
  };

  totals?: { total_devengado_commissions?: number };

  rankingsDelegates?: Array<{
    id: string;
    name: string;
    email: string | null;
    units_sale?: number;
    units_promotion?: number;
    commission: number;
  }>;

  rankingsRecommenders?: Array<{
    id: string;
    name: string;
    contact_email?: string | null;
    tax_id?: string | null;
    units_sale?: number;
    units_promotion?: number;
    commission: number;
  }>;

  activity?: {
    recent_imports?: Array<any>;
    calc_meta_sample?: any;
  };

  stage?: string;
  error?: string;
};

type ObjectivesPayload = {
  ok: boolean;
  month: string;
  year: number;
  targets_month: {
    target_units_total: number;
    target_delegates_active: number | null;
    notes?: string | null;
    updated_at?: string | null;
  };
  actual_month: {
    units_total: number;
    delegates_count: number;
  } | null;
  progress_month: {
    units_pct: number | null;
    units_delta: number;
    delegates_pct: number | null;
    delegates_delta: number | null;
  };
  channels_ytd: Array<{
    profile_key: string;
    profile_type: string;
    target_units: number;
    actual_units_ytd: number;
    progress_pct: number | null;
    remaining_units: number;
  }>;
  stage?: string;
  error?: string;
};

type ExecStatus = "on_track" | "risk" | "off_track" | "unknown";

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
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}

function clampPct(n: number | null | undefined) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function statusLabel(s: ExecStatus) {
  if (s === "on_track") return "🟢 En objetivo";
  if (s === "risk") return "🟠 En riesgo";
  if (s === "off_track") return "🔴 Fuera de objetivo";
  return "— Sin objetivo (MVP)";
}

function statusBadgeVariant(
  s: ExecStatus
): "default" | "success" | "warning" | "danger" {
  if (s === "on_track") return "success";
  if (s === "risk") return "warning";
  if (s === "off_track") return "danger";
  return "default";
}

function parseMonth01(month01: string): Date | null {
  if (!/^\d{4}-\d{2}-01$/.test(month01)) return null;
  const [y, m] = month01.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return new Date(y, m - 1, 1);
}

function daysInMonth(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  return new Date(y, m + 1, 0).getDate();
}

function fmtDateTimeISO(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function DashboardClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const month01 = useMemo(() => {
    const m = sp.get("month");
    return m && /^\d{4}-\d{2}-01$/.test(m) ? m : getDefaultMonth01();
  }, [sp]);

  const yyyymm = useMemo(() => yyyymmFromMonth01(month01), [month01]);

  const [data, setData] = useState<MonthSummary | null>(null);
  const [objectives, setObjectives] = useState<ObjectivesPayload | null>(null);

  const [loading, setLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [objError, setObjError] = useState<string | null>(null);

  async function getTokenOrRedirect(): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;

    if (!token) {
      router.replace(
        `/login?next=${encodeURIComponent("/control-room/dashboard")}`
      );
      return null;
    }
    return token;
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    setObjError(null);

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const [resMonth, resObj] = await Promise.all([
        fetch("/api/control-room/month", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ month: month01 }),
        }),
        fetch("/api/control-room/objectives", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ month: month01 }),
        }),
      ]);

      const jsonMonth = (await resMonth.json().catch(() => null)) as
        | MonthSummary
        | null;
      const jsonObj = (await resObj.json().catch(() => null)) as
        | ObjectivesPayload
        | null;

      if (!jsonMonth || !resMonth.ok || !jsonMonth.ok) {
        setData(jsonMonth);
        setError(
          jsonMonth?.error ?? `Error cargando datos (${resMonth.status})`
        );
      } else {
        setData(jsonMonth);
      }

      if (!jsonObj || !resObj.ok || !jsonObj.ok) {
        setObjectives(jsonObj);
        setObjError(
          jsonObj?.error ??
            `Objetivos no disponibles (${resObj.status}). ¿Rol admin?`
        );
      } else {
        setObjectives(jsonObj);
      }
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function recalc() {
    setRecalcLoading(true);
    setError(null);

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const res = await fetch("/api/commissions/recalc", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ month: month01 }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? `Recalc error (${res.status})`);
      } else {
        await loadData();
      }
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setRecalcLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month01]);

  // ===== KPI calculados (fallbacks seguros)
  const kpi = data?.kpi_month;
  const invoicesPaidCount = kpi?.invoices_paid_count ?? null;
  const clientsCount = kpi?.clients_count ?? null;
  const delegatesCount = kpi?.delegates_count ?? null;

  const unitsSale = Number(kpi?.units_sale ?? 0) || 0;
  const unitsPromo = Number(kpi?.units_promotion ?? 0) || 0;
  const unitsTotal = Number(kpi?.units_total ?? unitsSale + unitsPromo) || 0;

  const totalNet = Number(kpi?.total_net ?? 0) || 0;
  const totalVat = Number(kpi?.total_vat ?? 0) || 0;
  const totalGross = Number(kpi?.total_gross ?? 0) || 0;

  const updatedAt = objectives?.targets_month?.updated_at ?? null;

  // ===== Objetivos (month)
  const tgtUnits = Number(objectives?.targets_month?.target_units_total ?? 0) || 0;
  const tgtDelegates = objectives?.targets_month?.target_delegates_active ?? null;

  const actUnits = Number(objectives?.actual_month?.units_total ?? unitsTotal) || 0;
  const actDelegates =
    objectives?.actual_month?.delegates_count ??
    (delegatesCount == null ? null : Number(delegatesCount));

  const unitsPct = objectives?.progress_month?.units_pct ?? null;
  const unitsGap =
    objectives?.progress_month?.units_delta ??
    (tgtUnits > 0 ? tgtUnits - actUnits : 0);

  const delegatesPct = objectives?.progress_month?.delegates_pct ?? null;
  const delegatesGap = objectives?.progress_month?.delegates_delta ?? null;

  const execStatus: ExecStatus = (() => {
    if (!tgtUnits) return "unknown";
    const p = clampPct(unitsPct);
    if (p >= 100) return "on_track";
    if (p >= 85) return "risk";
    return "off_track";
  })();

  // ===== Rankings (máx 3)
  const topDelegates = (data?.rankingsDelegates ?? [])
    .slice(0, 3)
    .map((r) => {
      const sale = Number(r.units_sale ?? 0) || 0;
      const promo = Number(r.units_promotion ?? 0) || 0;
      return {
        ...r,
        units_total: sale + promo,
        units_sale_n: sale,
        units_promo_n: promo,
      };
    });

  const topRecommenders = (data?.rankingsRecommenders ?? [])
    .slice(0, 3)
    .map((r) => {
      const sale = Number(r.units_sale ?? 0) || 0;
      const promo = Number(r.units_promotion ?? 0) || 0;
      return {
        ...r,
        units_total: sale + promo,
        units_sale_n: sale,
        units_promo_n: promo,
      };
    });

  // ===== Diagnóstico automático (corto)
  const diagnosis = useMemo(() => {
    const total = Math.max(1, actUnits);
    const d1 = topDelegates[0]?.units_total ?? 0;
    const d2 = topDelegates[1]?.units_total ?? 0;
    const share2 = Math.round(((d1 + d2) / total) * 100);

    if ((data?.rankingsDelegates ?? []).length === 0) {
      return "Sin ranking disponible (MVP).";
    }

    if (share2 >= 60) {
      return `El ${share2}% de las unidades provienen de 2 delegados. Riesgo de concentración.`;
    }

    if (tgtUnits > 0 && unitsPct != null && unitsPct < 100) {
      return `Faltan ${formatInt(Math.max(0, unitsGap))} uds para objetivo. Prioriza activación comercial.`;
    }

    return "Distribución razonable. Mantener ritmo y foco en cierre de mes.";
  }, [actUnits, topDelegates, data?.rankingsDelegates, tgtUnits, unitsPct, unitsGap]);

  // ===== Acciones (checklist local)
  const [actions, setActions] = useState<Record<string, boolean>>({
    a1: false,
    a2: false,
    a3: false,
    a4: false,
  });

  // ===== Helpers UI (KPIs)
  const kpiCards: Array<{
    title: string;
    value: React.ReactNode;
    sub: React.ReactNode;
    badge: React.ReactNode | null;
    kind?: "units";
  }> = [
    {
      title: "Unidades vendidas",
      kind: "units",
      value: (
        <div className="text-3xl font-semibold tracking-tight" style={{ color: "var(--viho-primary)" }}>
          <span className="mr-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "rgba(42,29,32,0.65)" }}>
            Venta
          </span>
          {formatInt(unitsSale)}
        </div>
      ),
      sub: (
        <div className="mt-2 text-sm viho-muted space-y-1">
          <div>
            Promo <span className="font-mono">{formatInt(unitsPromo)}</span>
          </div>
          <div>
            Totales <span className="font-mono">{formatInt(unitsTotal)}</span>
          </div>
        </div>
      ),
      badge: null,
    },
    {
      title: "Delegados activos",
      value: (
        <div className="text-3xl font-semibold tracking-tight" style={{ color: "var(--viho-primary)" }}>
          {actDelegates == null ? "—" : formatInt(actDelegates)}
        </div>
      ),
      sub: (
        <div className="mt-2 text-sm viho-muted">
          {tgtDelegates == null
            ? "Obj —"
            : `Obj ${formatInt(tgtDelegates)} · ${delegatesPct == null ? "—" : `${delegatesPct}%`}`}
        </div>
      ),
      badge: null,
    },
    {
      title: "Facturado",
      value: (
        <div className="text-3xl font-semibold tracking-tight" style={{ color: "var(--viho-primary)" }}>
          {formatMoneyEUR(totalGross)}
        </div>
      ),
      sub: (
        <div className="mt-2 text-sm viho-muted">
          Neto {formatMoneyEUR(totalNet)} · IVA {formatMoneyEUR(totalVat)}
        </div>
      ),
      badge: null,
    },
    {
      title: "Margen",
      value: (
        <div className="text-3xl font-semibold tracking-tight" style={{ color: "var(--viho-primary)" }}>
          —
        </div>
      ),
      sub: <div className="mt-2 text-sm viho-muted">MVP: pendiente cálculo margen</div>,
      badge: <Badge variant="warning">MVP</Badge>,
    },
  ];

  // ===== Proyección cierre (simple)
  const projection = useMemo(() => {
    const d = parseMonth01(month01);
    if (!d) return null;
    const totalDays = daysInMonth(d);
    const today = new Date();
    const sameMonth = today.getFullYear() === d.getFullYear() && today.getMonth() === d.getMonth();
    const day = sameMonth ? today.getDate() : Math.min(1, totalDays);
    const pace = day > 0 ? actUnits / day : 0;
    const projected = Math.round(pace * totalDays);
    const pacePct = Math.round((day / totalDays) * 100);
    return { projected, pacePct };
  }, [month01, actUnits]);

  return (
    <div className="space-y-6">
      {/* HEADER EJECUTIVO */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest viho-muted">
            VIHOLABS · CONTROL ROOM
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Situation Room (Executive View)
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm viho-muted">
            <span>Periodo:</span>
            <span className="font-mono">{month01}</span>
            <Badge title="Regla del sistema">Solo facturas cobradas</Badge>
            <Badge title="Referencia">PDV: 31€</Badge>
            <Badge title="Última actualización objetivos">
              Últ. update: {fmtDateTimeISO(updatedAt)}
            </Badge>
            {data?.warning_actor_missing ? (
              <Badge variant="warning">Actor pendiente de alta</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="rounded-2xl border px-3 py-2"
            style={{
              borderColor: "var(--viho-border)",
              background: "rgba(255,255,255,0.9)",
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider viho-muted">
              Mes
            </div>
            <input
              type="month"
              value={yyyymm}
              onChange={(e) => {
                const next = month01FromYYYYMM(e.target.value);
                router.push(
                  `/control-room/dashboard?month=${encodeURIComponent(next)}`
                );
              }}
              className="mt-1 w-[150px] bg-transparent text-sm outline-none"
              style={{ color: "var(--viho-text)" }}
            />
          </div>

          <Button variant="outline" onClick={() => router.push("/import")}>
            Ir a importación
          </Button>

          <Button onClick={recalc} disabled={recalcLoading || loading}>
            {recalcLoading ? "Recalculando…" : "Recalcular"}
          </Button>
        </div>
      </div>

      {/* ERROR */}
      {error ? (
        <Card>
          <CardContent className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm">{error}</div>
              {data?.stage ? (
                <div className="mt-1 text-xs viho-muted">
                  Stage: <span className="font-mono">{data.stage}</span>
                </div>
              ) : null}
            </div>
            <Badge variant="danger">ERROR</Badge>
          </CardContent>
        </Card>
      ) : null}

      {/* 1) KPIs CLAVE (PRIMERO) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle>{c.title}</CardTitle>
              {c.badge}
            </CardHeader>
            <CardContent>
              {/* value ya viene formateado */}
              {c.value}
              {/* sub ya viene formateado */}
              {c.sub}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 2) ESTADO GENERAL DEL MES (DESPUÉS) */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Estado general del mes</CardTitle>
            <div className="mt-1 text-sm viho-muted">
              Estado · Gap · Tendencia · Responsables
            </div>
          </div>

          <Badge variant={statusBadgeVariant(execStatus)}>
            {statusLabel(execStatus)}
          </Badge>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Progreso */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">
              Progreso
            </div>
            <div className="mt-1 text-4xl font-semibold" style={{ color: "var(--viho-primary)" }}>
              {unitsPct == null ? "—" : `${clampPct(unitsPct)}%`}
            </div>
            <div className="text-xs viho-muted">
              {projection ? `Ritmo mes: ${projection.pacePct}%` : "—"}
            </div>
          </div>

          {/* Objetivo vs Real */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">
              Objetivo vs Real
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--viho-text)" }}>
              Objetivo: <b>{tgtUnits > 0 ? formatInt(tgtUnits) : "—"}</b> uds
              <br />
              Actual: <b>{formatInt(actUnits)}</b> uds
              <br />
              Gap:{" "}
              <b>{tgtUnits > 0 ? formatInt(Math.max(0, unitsGap)) : "—"}</b> uds
            </div>
          </div>

          {/* Tendencia */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">
              Tendencia (MVP)
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--viho-text)" }}>
              Proyección cierre:{" "}
              <b>{projection ? formatInt(projection.projected) : "—"}</b> uds
              <div className="mt-2 text-xs viho-muted">
                Lectura rápida: {diagnosis}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3) OBJETIVOS VS REAL (compacto) */}
      <Card>
        <CardHeader>
          <CardTitle>Objetivos vs Real (compacto)</CardTitle>
          <div className="mt-1 text-sm viho-muted">Gap visible</div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead className="text-right">Objetivo</TableHead>
                <TableHead className="text-right">Real</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Gap</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Unidades</TableCell>
                <TableCell className="text-right">
                  {tgtUnits > 0 ? formatInt(tgtUnits) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatInt(actUnits)}</TableCell>
                <TableCell className="text-right">
                  {unitsPct == null ? (
                    <span className="viho-muted">—</span>
                  ) : (
                    <Badge variant={Number(unitsPct) >= 100 ? "success" : "default"}>
                      {Number(unitsPct)}%
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {tgtUnits > 0 ? formatInt(Math.max(0, unitsGap)) : "—"}
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">Delegados activos</TableCell>
                <TableCell className="text-right">
                  {tgtDelegates == null ? "—" : formatInt(tgtDelegates)}
                </TableCell>
                <TableCell className="text-right">
                  {actDelegates == null ? "—" : formatInt(actDelegates)}
                </TableCell>
                <TableCell className="text-right">
                  {delegatesPct == null ? (
                    <span className="viho-muted">—</span>
                  ) : (
                    <Badge
                      variant={Number(delegatesPct) >= 100 ? "success" : "default"}
                    >
                      {Number(delegatesPct)}%
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {delegatesGap == null ? "—" : formatInt(delegatesGap)}
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">Recomendadores activos</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">
                  <span className="viho-muted">—</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="viho-muted">MVP</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {objError ? (
            <div className="mt-3 text-xs viho-muted">
              Nota MVP: objetivos no disponibles o sin permisos. (Endpoint objetivos)
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 4) RANKINGS ESTRATÉGICOS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Delegados (mes)</CardTitle>
            <div className="mt-1 text-sm viho-muted">Máx 3 · unidades y comisión</div>
          </CardHeader>

          <CardContent>
            {topDelegates.length === 0 ? (
              <div className="text-sm viho-muted">Sin datos (MVP).</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delegado</TableHead>
                    <TableHead className="text-right">Uds</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDelegates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.name}
                        <div className="text-xs viho-muted">{r.email ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono">{formatInt(r.units_total)}</span>
                        <div className="text-[11px] viho-muted">
                          {formatInt(r.units_sale_n)} venta · {formatInt(r.units_promo_n)} promo
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoneyEUR(Number(r.commission ?? 0) || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Recomendadores (mes)</CardTitle>
            <div className="mt-1 text-sm viho-muted">Máx 3 · unidades asociadas y comisión</div>
          </CardHeader>

          <CardContent>
            {topRecommenders.length === 0 ? (
              <div className="text-sm viho-muted">Sin datos (MVP).</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recomendador</TableHead>
                    <TableHead className="text-right">Uds</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRecommenders.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.name}
                        <div className="text-xs viho-muted">
                          {r.contact_email ?? "—"} · {r.tax_id ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono">{formatInt(r.units_total)}</span>
                        <div className="text-[11px] viho-muted">
                          {formatInt(r.units_sale_n)} venta · {formatInt(r.units_promo_n)} promo
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoneyEUR(Number((r as any).commission ?? 0) || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5) DIAGNÓSTICO + ACCIONES */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Diagnóstico automático</CardTitle>
              <div className="mt-1 text-sm viho-muted">Lectura rápida para ejecución</div>
            </div>
            <Badge variant="default">MVP</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm" style={{ color: "var(--viho-text)" }}>
              {diagnosis}
            </div>
            <div className="mt-3 text-xs viho-muted">
              Nota: heurística simple (foco concentración + gap objetivo). Se refina en fase 2.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acciones (checklist)</CardTitle>
            <div className="mt-1 text-sm viho-muted">No se guarda (MVP)</div>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { k: "a1", label: "Activar top 5 leads" },
              { k: "a2", label: "Contactar 2 delegados clave" },
              { k: "a3", label: "Revisar incidencias importación" },
              { k: "a4", label: "Validar objetivos del mes" },
            ].map((a) => (
              <label key={a.k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!actions[a.k]}
                  onChange={(e) =>
                    setActions((prev) => ({ ...prev, [a.k]: e.target.checked }))
                  }
                />
                <span style={{ color: "var(--viho-text)" }}>{a.label}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 6) CONTEXTO OPERATIVO */}
      <Card>
        <CardHeader>
          <CardTitle>Contexto operativo</CardTitle>
          <div className="mt-1 text-sm viho-muted">Facturas cobradas · clientes · delegados</div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">
              Facturas cobradas
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {invoicesPaidCount == null ? "—" : formatInt(invoicesPaidCount)}
            </div>
            <div className="text-xs viho-muted">is_paid = true</div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">
              Clientes únicos
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {clientsCount == null ? "—" : formatInt(clientsCount)}
            </div>
            <div className="text-xs viho-muted">distinct client_id</div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">
              Delegados activos (mes)
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {delegatesCount == null ? "—" : formatInt(delegatesCount)}
            </div>
            <div className="text-xs viho-muted">distinct delegate_id</div>
          </div>
        </CardContent>
      </Card>

      {/* Footer pequeño */}
      <div className="text-xs viho-muted">
        {loading ? "Cargando…" : "—"} · Actor:{" "}
        <span className="font-mono">
          {data?.actor?.role ?? "—"} · {data?.actor?.name ?? "—"}
        </span>
      </div>
    </div>
  );
}
