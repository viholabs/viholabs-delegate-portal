// src/app/api/holded/imported/route.ts
/**
 * VIHOLABS — HOLDed Imported Invoices (LOCAL TRUTH)
 *
 * Canon:
 * - READ ONLY
 * - No Holded API calls
 * - Uses DB truth (invoices table)
 * - SUPER_ADMIN only
 */

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type ActorLite = { id: string; role: string | null };

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
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "Unauthorized",
      });
    }

    const role = String(ar.actor.role ?? "").trim().toLowerCase();
    if (role !== "super_admin") {
      return json(403, { ok: false, stage: "authz", error: "Forbidden" });
    }

    stage = "supabase_service";
    const admin = getServiceSupabase();

    stage = "query_invoices";
    // Canonical local truth: invoices table
    const { data, error } = await admin
      .from("invoices")
      .select("id, invoice_number, client_name, invoice_date, source_month, created_at")
      .eq("source_provider", "holded")
      .order("invoice_number", { ascending: false })
      .limit(500);

    if (error) {
      return json(500, { ok: false, stage, error: error.message });
    }

    const rows = (Array.isArray(data) ? data : []).map((r: any) => ({
      invoice_id: r.id ?? null,
      invoice_number: r.invoice_number ?? null,
      client_name: r.client_name ?? null,
      invoice_date: r.invoice_date ?? null,
      invoice_month: r.source_month ?? null, // YYYY-MM
      imported_at: r.created_at ?? null,
    }));

    return json(200, { ok: true, stage: "ok", rows });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: String(e?.message ?? e) });
  }
}
