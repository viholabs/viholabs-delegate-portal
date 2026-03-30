import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type BixGrowLogItem = {
  id: string;
  timestamp: string | null;
  status: string | null;
  conversions: number | null;
  referrals: number | null;
  errors: number | null;
  message?: string | null;
};

function envConfigured(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "";
}

export async function GET(_request: NextRequest) {
  const configured =
    envConfigured("BIXGROW_API_KEY") ||
    envConfigured("BIXGROW_APP_ID") ||
    envConfigured("BIXGROW_WEBHOOK_SECRET");

  if (!configured) {
    const items: BixGrowLogItem[] = [
      {
        id: "bixgrow-not-configured",
        timestamp: null,
        status: "not_configured",
        conversions: 0,
        referrals: 0,
        errors: 0,
        message: "BixGrow no està configurat encara.",
      },
    ];

    return NextResponse.json({
      ok: true,
      items,
    });
  }

  const now = new Date().toISOString();

  const items: BixGrowLogItem[] = [
    {
      id: "bixgrow-configured",
      timestamp: now,
      status: "configured",
      conversions: 0,
      referrals: 0,
      errors: 0,
      message: "BixGrow configurat. Pendent de connector/log dedicat.",
    },
  ];

  return NextResponse.json({
    ok: true,
    items,
  });
}