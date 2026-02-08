// src/app/api/holded/invoices/[id]/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET(req: Request, { params }: any) {
  let stage = "init";

  try {
    stage = "auth";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) return json(ar?.status ?? 401, { ok: false, stage, error: ar?.error });

    const id = String(params?.id ?? "").trim();
    if (!id) return json(400, { ok: false, stage, error: "Missing id" });

    return json(200, {
      ok: true,
      stage: "ok",
      holded_id: id,
      note: "Endpoint placeholder (detalle se gestiona en paid-check)",
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message });
  }
}
