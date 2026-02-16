// src/app/api/obx/measurements/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

type Payload = {
  case_id: string;
  week_number: number;

  measurement_date?: string | null; // YYYY-MM-DD
  weight_kg?: number | null;
  waist_cm?: number | null;
  abdomen_high_cm?: number | null;
  abdomen_low_cm?: number | null;
  notes?: string | null;

  request_id?: string | null;
  audit_source?: string | null;
  audit_reason?: string | null; // obligatori canònicament per UPDATE
};

function asString(v: any) {
  return String(v ?? "").trim();
}

function asNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const actorRes = await getActorFromRequest(req);
  if (!actorRes?.ok) {
    return json(401, { ok: false, error: "unauthorized", detail: actorRes });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const case_id = asString(payload.case_id);
  const week_number = Number(payload.week_number);

  if (!case_id) return json(400, { ok: false, error: "case_id_required" });
  if (!Number.isFinite(week_number)) return json(400, { ok: false, error: "week_number_invalid" });
  if (week_number <= 0) return json(400, { ok: false, error: "week_number_must_be_gt0" });

  // ✅ Per UPDATE, audit_reason ha de ser obligatori (audit fort)
  const audit_reason = asString(payload.audit_reason);
  if (!audit_reason) return json(400, { ok: false, error: "audit_reason_required" });

  const request_id = asString(payload.request_id) || `obx_api_${Date.now()}`;
  const audit_source = asString(payload.audit_source) || "user";

  const measurement_date = payload.measurement_date ?? null;
  const weight_kg = asNumberOrNull(payload.weight_kg);
  const waist_cm = asNumberOrNull(payload.waist_cm);
  const abdomen_high_cm = asNumberOrNull(payload.abdomen_high_cm);
  const abdomen_low_cm = asNumberOrNull(payload.abdomen_low_cm);
  const notes = payload.notes ?? null;

  // ✅ Exigir que com a mínim vingui 1 camp a actualitzar (robust)
  const hasAnyField =
    measurement_date !== null ||
    weight_kg !== null ||
    waist_cm !== null ||
    abdomen_high_cm !== null ||
    abdomen_low_cm !== null ||
    notes !== null;

  if (!hasAnyField) {
    return json(400, { ok: false, error: "no_fields_to_update" });
  }

  const { data, error } = await supabase.rpc("rpc_update_measurement_week_gt0", {
    p_case_id: case_id,
    p_week_number: week_number,
    p_measurement_date: measurement_date,
    p_weight_kg: weight_kg,
    p_waist_cm: waist_cm,
    p_abdomen_high_cm: abdomen_high_cm,
    p_abdomen_low_cm: abdomen_low_cm,
    p_notes: notes,
    p_request_id: request_id,
    p_audit_source: audit_source,
    p_audit_reason: audit_reason,
  });

  if (error) {
    return json(400, { ok: false, error: "rpc_failed", message: error.message });
  }

  return json(200, { ok: true, updated: data });
}
