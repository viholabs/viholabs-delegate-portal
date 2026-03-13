"use client";

import * as React from "react";

type PerformancePayload = {
  ok: true;
  period_month: string;
  month: {
    issued: number | null;
    paid: number | null;
    pending: number | null;
    overdue: number | null;
    source: {
      issued: string | null;
      paid: string | null;
      pending: string | null;
      overdue: string | null;
    };
  };
  year: {
    accumulated: number | null;
    source: {
      accumulated: string | null;
    };
  };
  targets: {
    month_units: {
      target: number | null;
      source: string | null;
    };
    year_units: {
      target: number | null;
      source: string | null;
      profile_type: string | null;
    };
    month_revenue: {
      target: number | null;
      source: string | null;
    };
    year_revenue: {
      target: number | null;
      source: string | null;
    };
  };
  actuals: {
    month_units_sold: {
      value: number | null;
      source: string | null;
    };
    year_units_accumulated: {
      value: number | null;
      source: string | null;
    };
  };
  compliance: {
    month_units_pct: number | null;
    year_units_pct: number | null;
    month_revenue_pct: number | null;
    year_revenue_pct: number | null;
  };
  visibility: {
    show_month_units_block: boolean;
    show_year_units_block: boolean;
    show_month_revenue_target: boolean;
    show_year_revenue_target: boolean;
    show_month_units_pct: boolean;
    show_year_units_pct: boolean;
    show_month_revenue_pct: boolean;
    show_year_revenue_pct: boolean;
    show_month_billing_block: boolean;
    show_year_billing_block: boolean;
  };
  notes: string[];
  audit_status?: "disabled_until_audit";
  audit_message?: string;
};

type ApiErrorPayload = {
  ok: false;
  error: string;
};

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatPeriodLabel(periodMonth: string): string {
  const date = new Date(`${periodMonth}T00:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#E8DCC5] bg-white/70 p-3 shadow-sm">
      <div className="mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
          {title}
        </h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-[#5A4B38]">{label}</span>
      <span className="text-sm font-semibold text-[#2E261D]">{value}</span>
    </div>
  );
}

function SourceRow({
  source,
}: {
  source: string | null;
}) {
  if (!source) return null;

  return (
    <div className="pt-1 text-[11px] leading-4 text-[#8B7355]">
      Fuente: {source}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-[28px] border border-[#E8DCC5] bg-[#FFFDF8] p-4 shadow-sm">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
        Performance
      </div>
      <div className="text-sm text-[#6E5B43]">Cargando…</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[28px] border border-[#E7C1C1] bg-[#FFF7F7] p-4 shadow-sm">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A3B3B]">
        Performance
      </div>
      <div className="text-sm text-[#8A3B3B]">{message}</div>
    </div>
  );
}

function DisabledState({
  periodLabel,
  message,
}: {
  periodLabel: string;
  message: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#E8DCC5] bg-[#FFFDF8] p-4 shadow-sm">
      <div className="border-b border-[#EADDB7] pb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
          Performance
        </div>
        <div className="mt-1 text-sm text-[#8B7355]">
          Periodo activo:{" "}
          <span className="font-medium text-[#5A4B38]">{periodLabel}</span>
        </div>
      </div>

      <div className="mt-3 rounded-[22px] border border-[#E8DCC5] bg-white/70 p-4 shadow-sm">
        <div className="text-sm font-medium text-[#2E261D]">
          Bloque en revisión canónica
        </div>
        <div className="mt-2 text-sm leading-6 text-[#6E5B43]">{message}</div>
      </div>
    </div>
  );
}

export default function PerformanceAdminBlock() {
  const [data, setData] = React.useState<PerformancePayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/community/performance", {
          method: "GET",
          cache: "no-store",
        });

        const json = (await response.json()) as
          | PerformancePayload
          | ApiErrorPayload;

        if (!response.ok || !json.ok) {
          const message =
            "error" in json
              ? json.error
              : "No se pudo cargar /api/community/performance";
          throw new Error(message);
        }

        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error desconocido");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <ErrorState message="No hay datos disponibles." />;

  const periodLabel = formatPeriodLabel(data.period_month);

  const hasVisibleContent =
    data.visibility.show_month_billing_block ||
    data.visibility.show_year_billing_block ||
    data.visibility.show_month_revenue_target ||
    data.visibility.show_year_revenue_target ||
    data.visibility.show_month_units_block ||
    data.visibility.show_year_units_block;

  if (!hasVisibleContent || data.audit_status === "disabled_until_audit") {
    return (
      <DisabledState
        periodLabel={periodLabel}
        message={
          data.audit_message ??
          "Este bloque no muestra métricas hasta validar las fuentes reales y la semántica exacta de cada cifra."
        }
      />
    );
  }

  return (
    <div className="rounded-[28px] border border-[#E8DCC5] bg-[#FFFDF8] p-4 shadow-sm">
      <div className="border-b border-[#EADDB7] pb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
          Performance
        </div>
        <div className="mt-1 text-sm text-[#8B7355]">
          Periodo activo:{" "}
          <span className="font-medium text-[#5A4B38]">{periodLabel}</span>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {data.visibility.show_month_billing_block && (
          <Section title="Facturación mes">
            <MetricRow label="Emitida" value={formatCurrency(data.month.issued)} />
            <MetricRow label="Cobrada" value={formatCurrency(data.month.paid)} />
            <MetricRow
              label="Pendiente"
              value={formatCurrency(data.month.pending)}
            />
            <MetricRow
              label="Vencida"
              value={formatCurrency(data.month.overdue)}
            />
            <SourceRow source={data.month.source.issued} />
          </Section>
        )}

        {data.visibility.show_month_revenue_target && (
          <Section title="Objetivo facturación mes">
            <MetricRow
              label="Objetivo"
              value={formatCurrency(data.targets.month_revenue.target)}
            />
            <MetricRow label="Actual" value={formatCurrency(data.month.issued)} />
            {data.visibility.show_month_revenue_pct && (
              <MetricRow
                label="% cumplimiento"
                value={formatPercent(data.compliance.month_revenue_pct)}
              />
            )}
            <SourceRow source={data.targets.month_revenue.source} />
          </Section>
        )}

        {data.visibility.show_year_billing_block && (
          <Section title="Facturación anual">
            <MetricRow
              label="Acumulada"
              value={formatCurrency(data.year.accumulated)}
            />
            <SourceRow source={data.year.source.accumulated} />
          </Section>
        )}

        {data.visibility.show_year_revenue_target && (
          <Section title="Objetivo facturación anual">
            <MetricRow
              label="Objetivo"
              value={formatCurrency(data.targets.year_revenue.target)}
            />
            <MetricRow
              label="Actual"
              value={formatCurrency(data.year.accumulated)}
            />
            {data.visibility.show_year_revenue_pct && (
              <MetricRow
                label="% cumplimiento"
                value={formatPercent(data.compliance.year_revenue_pct)}
              />
            )}
            <SourceRow source={data.targets.year_revenue.source} />
          </Section>
        )}

        {data.visibility.show_month_units_block && (
          <Section title="Unidades mes">
            <MetricRow
              label="Vendidas"
              value={formatNumber(data.actuals.month_units_sold.value)}
            />
            <MetricRow
              label="Objetivo"
              value={formatNumber(data.targets.month_units.target)}
            />
            {data.visibility.show_month_units_pct && (
              <MetricRow
                label="% cumplimiento"
                value={formatPercent(data.compliance.month_units_pct)}
              />
            )}
            <SourceRow source={data.actuals.month_units_sold.source} />
          </Section>
        )}

        {data.visibility.show_year_units_block && (
          <Section title="Unidades anuales">
            <MetricRow
              label="Acumuladas"
              value={formatNumber(data.actuals.year_units_accumulated.value)}
            />
            <MetricRow
              label="Objetivo anual"
              value={formatNumber(data.targets.year_units.target)}
            />
            {data.visibility.show_year_units_pct && (
              <MetricRow
                label="% cumplimiento"
                value={formatPercent(data.compliance.year_units_pct)}
              />
            )}
            <SourceRow
              source={
                data.targets.year_units.source
                  ? `${data.targets.year_units.source}${
                      data.targets.year_units.profile_type
                        ? ` [profile_type=${data.targets.year_units.profile_type}]`
                        : ""
                    }`
                  : null
              }
            />
          </Section>
        )}
      </div>
    </div>
  );
}