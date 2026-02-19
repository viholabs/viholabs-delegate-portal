// src/app/api/control-room/holded-sync/last-run/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type ActorLite = {
  id: string;
  role: string | null;
  status?: string | null;
  name?: string | null;
  email?: string | null;
};

type ActorFromRequestOk = {
  ok: true;
  actor: ActorLite;
  supaRls: any;
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);
    if (!isOk(ar)) {
      return json(ar?.status ?? 401, { ok: false, stage, error: ar?.error ?? "Unauthorized" });
    }

    const role = String(ar.actor.role ?? "").trim().toLowerCase();
    if (role !== "super_admin") {
      return json(403, { ok: false, stage: "authz", error: "Forbidden" });
    }

    stage = "supabase_service";
    const admin = getServiceSupabase();

    stage = "query_last_run";
    const { data, error } = await admin
      .from("v_holded_sync_last_run")
      .select(
        "job,ok,stage,error_message,total_ids,imported,failed,advanced,started_at,finished_at,mode,payload,github_run_id,github_repo,github_sha"
      )
      .eq("job", "holded_invoices_incremental")
      .limit(1);

    if (error) return json(500, { ok: false, stage, error: error.message });

    const row = Array.isArray(data) && data[0] ? data[0] : null;

    return json(200, { ok: true, stage: "ok", row });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: String(e?.message ?? e) });
  }
}
