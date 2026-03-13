// src/app/api/holded/invoices/route.ts

import { NextRequest, NextResponse } from "next/server";
import { POST as canonicalPOST } from "./import-incremental/route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return canonicalPOST(req);
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Method not allowed. Use POST /api/holded/invoices",
    },
    { status: 405 },
  );
}