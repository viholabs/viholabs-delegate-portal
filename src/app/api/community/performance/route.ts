import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PerformanceResponse = {
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
  audit_status: "disabled_until_audit";
  audit_message: string;
};

function getCurrentPeriodMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export async function GET() {
  try {
    const response: PerformanceResponse = {
      ok: true,
      period_month: getCurrentPeriodMonth(),
      month: {
        issued: null,
        paid: null,
        pending: null,
        overdue: null,
        source: {
          issued: null,
          paid: null,
          pending: null,
          overdue: null,
        },
      },
      year: {
        accumulated: null,
        source: {
          accumulated: null,
        },
      },
      targets: {
        month_units: {
          target: null,
          source: null,
        },
        year_units: {
          target: null,
          source: null,
          profile_type: null,
        },
        month_revenue: {
          target: null,
          source: null,
        },
        year_revenue: {
          target: null,
          source: null,
        },
      },
      actuals: {
        month_units_sold: {
          value: null,
          source: null,
        },
        year_units_accumulated: {
          value: null,
          source: null,
        },
      },
      compliance: {
        month_units_pct: null,
        year_units_pct: null,
        month_revenue_pct: null,
        year_revenue_pct: null,
      },
      visibility: {
        show_month_units_block: false,
        show_year_units_block: false,
        show_month_revenue_target: false,
        show_year_revenue_target: false,
        show_month_units_pct: false,
        show_year_units_pct: false,
        show_month_revenue_pct: false,
        show_year_revenue_pct: false,
        show_month_billing_block: false,
        show_year_billing_block: false,
      },
      notes: [],
      audit_status: "disabled_until_audit",
      audit_message:
        "Bloque desactivado temporalmente hasta validar fuentes reales y semántica canónica de cada métrica.",
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error in /api/community/performance";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}