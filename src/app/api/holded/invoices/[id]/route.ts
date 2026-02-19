// src/app/api/holded/invoices/[id]/route.ts
/**
 * VIHOLABS — HOLDed Invoice Detail (LOCAL TRUTH + ITEMS)
 *
 * Canon:
 * - READ ONLY
 * - No HOLDed API calls
 * - No schema changes
 * - SUPER_ADMIN only
 *
 * Input:
 * - params.id = invoices.id (UUID)  [as used by Z2PipelinesLive]
 *
 * Output (for Z2PipelinesLive drawer):
 * - { ok, invoice, items, units, items_error? }
 */

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
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

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request, { params }: any) {
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

    const invoiceId = String(params?.id ?? "").trim();
    if (!invoiceId) return json(400, { ok: false, stage: "input", error: "Missing id" });

    stage = "supabase_service";
    const admin = getServiceSupabase();

    stage = "query_invoice";
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select(
        "id, invoice_number, client_name, external_invoice_id, currency, total_gross, created_at, source_month, source_meta"
      )
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr) return json(500, { ok: false, stage, error: invErr.message });
    if (!inv?.id) return json(404, { ok: false, stage, error: "Invoice not found" });

    stage = "query_items";
    // We assume invoice_items has invoice_id FK to invoices.id (UUID).
    // If not, we'll return items_error deterministically.
    const { data: itemsData, error: itemsErr } = await admin
      .from("invoice_items")
      .select(
        "id, line_type, kind, units, description, unit_net_price, line_net_amount, vat_rate, line_vat_amount, line_gross_amount, created_at"
      )
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });

    let items_error: string | null = null;
    const items = Array.isArray(itemsData) ? itemsData : [];

    if (itemsErr) {
      // Do not fail the whole drawer: return invoice + items_error (canon: evidence)
      items_error = itemsErr.message;
    }

    stage = "compute_units";
    const units = {
      sold: 0,
      promo: 0,
      discount: 0,
      neutral: 0,
    };

    if (!itemsErr) {
      for (const it of items as any[]) {
        const kind = String(it?.kind ?? "").toUpperCase();
        const u = toNumber(it?.units) ?? 0;
        if (kind === "SALE") units.sold += u;
        else if (kind === "PROMO") units.promo += u;
        else if (kind === "DISCOUNT") units.discount += u;
        else units.neutral += u;
      }
    }

    stage = "ok";
    return json(200, {
      ok: true,
      stage,
      invoice: {
        id: inv.id,
        invoice_number: inv.invoice_number ?? null,
        client_name: inv.client_name ?? null,
        external_invoice_id: inv.external_invoice_id ?? null,
        currency: inv.currency ?? null,
        total_gross: inv.total_gross ?? null,
        created_at: inv.created_at ?? null,
        source_month: inv.source_month ?? null,
        source_meta: inv.source_meta ?? null,
      },
      items: itemsErr ? [] : items,
      units,
      ...(items_error ? { items_error } : {}),
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: String(e?.message ?? e) });
  }
}
