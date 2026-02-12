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

// ✅ HOLDed Sync (resultat mínim)
type HoldedSyncResult = {
  ok: boolean;
  source_month?: string;
  result?: { inserted: number; updated: number };
  stage?: string;
  error?: string;
};

// ✅ UI Contract (backend)
type UiContractStateRow = {
  screen_key: string;
  locale: string;
  state_code: string;
  label_title: string | null;
  label_icon: string | null;
  label_severity: string | null;
  color_token: string | null;
  alert_source: "SCREEN" | "GLOBAL" | null;
  alert_title: string | null;
  alert_body: string | null;
  alert_tooltip: string | null;
  alert_icon: string | null;
  alert_severity: string | null;
  alert_sort_order: number | null;
};

type UiContractContentRow = {
  screen_key: string;
  content_key: string;
  locale: string;
  state_code: string | null;
  content_id: string;
  source: "SCREEN" | "GLOBAL";
  title: string | null;
  body: string | null;
  tooltip: string | null;
  icon: string | null;
  severity: string | null;
  sort_order: number | null;
  effective_updated_at: string | null;
};

type UiContractOk = {
  ok: true;
  locale: string;
  state_ui: UiContractStateRow[];
  screen_content: UiContractContentRow[];
};

type UiContractFail = {
  ok: false;
  stage?: string;
  error: string;
};

type UiContractResponse = UiContractOk | UiContractFail;

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

// ✅ map severity -> Badge variant (tolerant)
function badgeVariantFromSeverity(
  sev?: string | null
): "default" | "success" | "warning" | "danger" {
  const s = (sev ?? "").toString().trim().toLowerCase();
  if (!s) return "default";
  if (["success", "ok", "good", "green", "info"].includes(s)) return "success";
  if (["warning", "warn", "amber", "orange"].includes(s)) return "warning";
  if (["danger", "error", "critical", "red"].includes(s)) return "danger";
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

function isUiOk(x: UiContractResponse | null): x is UiContractOk {
  return !!x && (x as any).ok === true;
}

function pickAlert(
  ui: UiContractResponse | null,
  screenKey: string,
  stateCode: string
) {
  if (!isUiOk(ui)) return null;
  const row = ui.state_ui.find(
    (r) => r.screen_key === screenKey && r.state_code === stateCode
  );
  if (!row) return null;
  if (!row.alert_title && !row.alert_body) return null;
  return row;
}

function pickContent(
  ui: UiContractResponse | null,
  screenKey: string,
  contentKey: string
) {
  if (!isUiOk(ui)) return null;
  const row = ui.screen_content.find(
    (r) => r.screen_key === screenKey && r.content_key === contentKey
  );
  if (!row) return null;
  return row;
}

// ✅ lectura tolerant de month.state_code (sense inventar-lo)
function monthStateCodeFromData(data: MonthSummary | null): string | null {
  if (!data) return null;

  const raw =
    (data as any)?.state_code ??
    (data as any)?.stateCode ??
    (data as any)?.month_state_code ??
    null;

  if (typeof raw !== "string") return null;

  const v = raw.trim();
  if (!v) return null;

  return v.toUpperCase();
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

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<HoldedSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [uiLoading, setUiLoading] = useState(false);
  const [uiContract, setUiContract] = useState<UiContractResponse | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);

  async function getTokenOrRedirect(): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;

    if (!token) {
      router.replace(`/login?next=${encodeURIComponent("/control-room/dashboard")}`);
      return null;
    }
    return token;
  }

  async function loadUiContract(token: string) {
    setUiLoading(true);
    setUiError(null);

    try {
      const locale = "es-ES";

      const res = await fetch("/api/control-room/ui-contract", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locale }),
      });

      const json = (await res.json().catch(() => null)) as UiContractResponse | null;

      if (!json || !res.ok || (json as any).ok !== true) {
        const msg = (json as any)?.error ?? `Error cargando contrato UI (${res.status}).`;
        setUiError(msg);
        setUiContract(json ?? { ok: false, error: msg });
        return;
      }

      setUiContract(json);
    } catch (e: any) {
      setUiError(e?.message ?? "Error inesperado (UI Contract)");
    } finally {
      setUiLoading(false);
    }
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

      void loadUiContract(token);

      const jsonMonth = (await resMonth.json().catch(() => null)) as MonthSummary | null;
      const jsonObj = (await resObj.json().catch(() => null)) as ObjectivesPayload | null;

      if (!jsonMonth || !resMonth.ok || !jsonMonth.ok) {
        setData(jsonMonth);
        setError(jsonMonth?.error ?? `Error cargando datos (${resMonth.status})`);
      } else {
        setData(jsonMonth);
      }

      if (!jsonObj || !resObj.ok || !jsonObj.ok) {
        setObjectives(jsonObj);
        setObjError(
          jsonObj?.error ?? `Objetivos no disponibles (${resObj.status}). ¿Rol admin?`
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

  async function syncHolded() {
    setSyncLoading(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const res = await fetch("/api/holded/import-all", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source_month: month01 }),
      });

      const json = (await res.json().catch(() => null)) as HoldedSyncResult | null;

      if (!json || !res.ok || !json.ok) {
        const msg = json?.error ?? `Error sincronizando HOLDed (${res.status}).`;
        setSyncError(msg);
        setSyncResult(json);
        return;
      }

      setSyncResult(json);
      await loadData();
    } catch (e: any) {
      setSyncError(e?.message ?? "Error inesperado");
    } finally {
      setSyncLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month01]);

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

  const tgtUnits = Number(objectives?.targets_month?.target_units_total ?? 0) || 0;
  const tgtDelegates = objectives?.targets_month?.target_delegates_active ?? null;

  const actUnits = Number(objectives?.actual_month?.units_total ?? unitsTotal) || 0;
  const actDelegates =
    objectives?.actual_month?.delegates_count ??
    (delegatesCount == null ? null : Number(delegatesCount));

  const unitsPct = objectives?.progress_month?.units_pct ?? null;
  const unitsGap =
    objectives?.progress_month?.units_delta ?? (tgtUnits > 0 ? tgtUnits - actUnits : 0);

  const delegatesPct = objectives?.progress_month?.delegates_pct ?? null;
  const delegatesGap = objectives?.progress_month?.delegates_delta ?? null;

  const execStatus: ExecStatus = (() => {
    if (!tgtUnits) return "unknown";
    const p = clampPct(unitsPct);
    if (p >= 100) return "on_track";
    if (p >= 85) return "risk";
    return "off_track";
  })();

  const topDelegates = (data?.rankingsDelegates ?? []).slice(0, 3).map((r) => {
    const sale = Number(r.units_sale ?? 0) || 0;
    const promo = Number(r.units_promotion ?? 0) || 0;
    return {
      ...r,
      units_total: sale + promo,
      units_sale_n: sale,
      units_promo_n: promo,
    };
  });

  const topRecommenders = (data?.rankingsRecommenders ?? []).slice(0, 3).map((r) => {
    const sale = Number(r.units_sale ?? 0) || 0;
    const promo = Number(r.units_promotion ?? 0) || 0;
    return {
      ...r,
      units_total: sale + promo,
      units_sale_n: sale,
      units_promo_n: promo,
    };
  });

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

  const kpiCards: Array<{
    title: string;
    value: React.ReactNode;
    sub: React.ReactNode;
    badge: React.ReactNode | null;
  }> = [
    {
      title: "Unidades vendidas",
      value: (
        <div className="text-3xl font-semibold tracking-tight" style={{ color: "var(--viho-primary)" }}>
          <span
            className="mr-2 text-sm font-semibold uppercase tracking-wider"
            style={{ color: "rgba(42,29,32,0.65)" }}
          >
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

  const screenKey = "control_room.dashboard";

  const monthStateCode = useMemo(() => monthStateCodeFromData(data), [data]);
  const execAlert = monthStateCode ? pickAlert(uiContract, screenKey, monthStateCode) : null;

  // Governança (per usar com a micro-badges, sense debug a la cara)
  const headerBadgeRow = pickContent(uiContract, screenKey, "header.badge");
  const headerBadgeText = headerBadgeRow?.title ?? null;
  const headerBadgeVariant = badgeVariantFromSeverity(headerBadgeRow?.severity);

  const helpIntroRow = pickContent(uiContract, screenKey, "help.intro");
  const helpIntroText = helpIntroRow?.body ?? helpIntroRow?.title ?? null;

  return (
    <div className="space-y-6">
      {/* EXEC TOP BAR (sense duplicar header del PortalShell) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm viho-muted">
            <span>Periodo:</span>
            <span className="font-mono">{month01}</span>

            {headerBadgeText ? (
              <Badge variant={headerBadgeVariant}>{headerBadgeText}</Badge>
            ) : null}

            <Badge title="Regla del sistema">Solo facturas cobradas</Badge>
            <Badge title="Referencia">PDV: 31€</Badge>
            <Badge title="Última actualización objetivos">Últ. update: {fmtDateTimeISO(updatedAt)}</Badge>
            {data?.warning_actor_missing ? <Badge variant="warning">Actor pendiente de alta</Badge> : null}
          </div>

          {helpIntroText ? (
            <div className="mt-2 text-sm viho-muted">{helpIntroText}</div>
          ) : null}

          {error ? (
            <div className="mt-2 text-sm">
              <Badge variant="danger" className="mr-2">
                ERROR
              </Badge>
              <span>{error}</span>
            </div>
          ) : null}

          {objError ? (
            <div className="mt-2 text-sm">
              <Badge variant="warning" className="mr-2">
                OBJ
              </Badge>
              <span>{objError}</span>
            </div>
          ) : null}

          {syncError ? (
            <div className="mt-2 text-sm">
              <Badge variant="warning" className="mr-2">
                HOLDed
              </Badge>
              <span>{syncError}</span>
            </div>
          ) : null}

          {syncResult?.ok ? (
            <div className="mt-2 text-sm viho-muted">
              HOLDed OK · inserted{" "}
              <span className="font-mono">{formatInt(syncResult.result?.inserted ?? 0)}</span> · updated{" "}
              <span className="font-mono">{formatInt(syncResult.result?.updated ?? 0)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="rounded-2xl border px-3 py-2"
            style={{
              borderColor: "var(--viho-border)",
              background: "rgba(255,255,255,0.9)",
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider viho-muted">Mes</div>
            <input
              type="month"
              value={yyyymm}
              onChange={(e) => {
                const next = month01FromYYYYMM(e.target.value);
                router.push(`/control-room/dashboard?month=${encodeURIComponent(next)}`);
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

          <Button variant="outline" onClick={syncHolded} disabled={syncLoading || loading}>
            {syncLoading ? "Sincronizando…" : "Sync HOLDed"}
          </Button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle>{c.title}</CardTitle>
              {c.badge}
            </CardHeader>
            <CardContent>
              {c.value}
              {c.sub}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ESTADO GENERAL */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Estado general del mes</CardTitle>
            <div className="mt-1 text-sm viho-muted">Estado · Gap · Tendencia · Lectura</div>
          </div>

          <Badge variant={statusBadgeVariant(execStatus)}>{statusLabel(execStatus)}</Badge>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">Progreso</div>
            <div className="mt-1 text-4xl font-semibold" style={{ color: "var(--viho-primary)" }}>
              {unitsPct == null ? "—" : `${clampPct(unitsPct)}%`}
            </div>
            <div className="text-xs viho-muted">{projection ? `Ritmo mes: ${projection.pacePct}%` : "—"}</div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">Objetivo vs Real</div>
            <div className="mt-1 text-sm" style={{ color: "var(--viho-text)" }}>
              Objetivo: <b>{tgtUnits > 0 ? formatInt(tgtUnits) : "—"}</b> uds
              <br />
              Actual: <b>{formatInt(actUnits)}</b> uds
              <br />
              Gap: <b>{tgtUnits > 0 ? formatInt(Math.max(0, unitsGap)) : "—"}</b> uds
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider viho-muted">Tendencia (MVP)</div>
            <div className="mt-1 text-sm" style={{ color: "var(--viho-text)" }}>
              Proyección cierre: <b>{projection ? formatInt(projection.projected) : "—"}</b> uds
              <div className="mt-2 text-xs viho-muted">Lectura rápida: {diagnosis}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AUDITORÍA UI (plegada per defecte) */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Auditoría UI (MVP)</CardTitle>
            <div className="mt-1 text-sm viho-muted">
              Contrato UI · state_code · alerta ejecutiva (plegado por defecto)
            </div>
          </div>
          <div className="flex items-center gap-2">
            {uiError ? <Badge variant="danger">UI ERROR</Badge> : null}
            {uiLoading ? <Badge variant="default">Cargando…</Badge> : <Badge variant="default">—</Badge>}
          </div>
        </CardHeader>

        <CardContent>
          <details>
            <summary className="cursor-pointer text-sm viho-muted">
              Ver detalle (screen_key <span className="font-mono">{screenKey}</span>)
            </summary>

            <div className="mt-3 space-y-3">
              <div className="text-xs viho-muted">
                month.state_code: <span className="font-mono">{monthStateCode ?? "—"}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const token = await getTokenOrRedirect();
                    if (!token) return;
                    await loadUiContract(token);
                  }}
                  disabled={uiLoading || loading}
                >
                  {uiLoading ? "Cargando…" : "Recargar UI"}
                </Button>

                {!uiError && isUiOk(uiContract) ? (
                  <div className="text-xs viho-muted">
                    OK · state_ui <span className="font-mono">{uiContract.state_ui.length}</span> · screen_content{" "}
                    <span className="font-mono">{uiContract.screen_content.length}</span>
                  </div>
                ) : null}
              </div>

              {uiError ? (
                <div className="text-sm">
                  <Badge variant="danger" className="mr-2">
                    ERROR
                  </Badge>
                  <span>{uiError}</span>
                </div>
              ) : null}

              {monthStateCode ? (
                execAlert ? (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider viho-muted">
                      Alerta ejecutiva (state_code {monthStateCode})
                    </div>
                    <div className="mt-1 font-medium">{execAlert.alert_title ?? "—"}</div>
                    <div className="mt-1 text-sm viho-muted">{execAlert.alert_body ?? "—"}</div>
                    <div className="mt-1 text-xs viho-muted">
                      source <span className="font-mono">{execAlert.alert_source ?? "—"}</span> · severity{" "}
                      <span className="font-mono">{execAlert.alert_severity ?? "—"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs viho-muted">
                    No hay alerta definida para state_code <span className="font-mono">{monthStateCode}</span>.
                  </div>
                )
              ) : (
                <div className="text-xs viho-muted">
                  state_code del mes no disponible en /api/control-room/month (no se muestra alerta EXEC).
                </div>
              )}
            </div>
          </details>
        </CardContent>
      </Card>

      {/* FOOTER DISCRET */}
      <div className="text-xs viho-muted">
        {loading ? "Cargando…" : "—"} · Actor:{" "}
        <span className="font-mono">
          {data?.actor?.role ?? "—"} · {data?.actor?.name ?? "—"}
        </span>{" "}
        · Facturas pagadas: <span className="font-mono">{invoicesPaidCount ?? "—"}</span> · Clientes:{" "}
        <span className="font-mono">{clientsCount ?? "—"}</span> · Delegados:{" "}
        <span className="font-mono">{delegatesCount ?? "—"}</span>
      </div>
    </div>
  );
}
