// src/app/api/control-room/invoices/bulk/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

// ✅ boolean estricto (evita el bug: "false" -> true)
function parseBoolStrict(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return undefined;
}

function getServiceClientOrThrow() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

type BulkUpdate = {
  invoice_id: string;
  is_paid?: boolean;
  source_channel?: string;
  delegate_id?: string | null; // delegates.id
  apply_delegate_to_client?: boolean;
};

function hasAnyPermission(
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean },
  codes: string[]
) {
  if (eff.isSuperAdmin) return true;
  return codes.some((c) => eff.has(c));
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    // ✅ Auth canónica (una sola vez)
    stage = "getActorFromRequest";
    const r = await getActorFromRequest(req);
    if (!r.ok) return json(r.status, { ok: false, stage, error: r.error });

    // ✅ Permisos efectivos (Biblia: no roles hardcoded)
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed = hasAnyPermission(eff, [
      "control_room.invoices.bulk",
      "control_room.invoices.manage",
      "invoices.manage",
      "invoices.write",
    ]);

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (control_room.invoices.bulk)",
      });
    }

    // ✅ Escritura/actualización: service role
    stage = "service_client";
    const supabase = getServiceClientOrThrow();

    stage = "body";
    const body = await req.json().catch(() => null);
    const updates: BulkUpdate[] = Array.isArray(body?.updates) ? body.updates : [];

    if (!updates.length)
      return json(400, { ok: false, stage, error: "Missing updates[]" });

    const clean: BulkUpdate[] = updates
      .map((u: any) => {
        const isPaidParsed = parseBoolStrict(u?.is_paid);
        return {
          invoice_id: safeStr(u?.invoice_id),
          is_paid: isPaidParsed, // ✅ aquí: false es false
          source_channel: safeStr(u?.source_channel || ""),
          delegate_id:
            u?.delegate_id === null
              ? null
              : u?.delegate_id
              ? safeStr(u.delegate_id)
              : undefined,
          apply_delegate_to_client: !!u?.apply_delegate_to_client,
        };
      })
      .filter((u) => !!u.invoice_id);

    if (!clean.length)
      return json(400, {
        ok: false,
        stage,
        error: "All updates missing invoice_id",
      });

    // Validar delegates existentes
    stage = "validate_delegates";
    const delegateIds = Array.from(
      new Set(
        clean
          .map((u) => (u.delegate_id === undefined ? null : u.delegate_id))
          .filter((x): x is string => !!x)
      )
    );

    if (delegateIds.length) {
      const { data: dels, error: derr } = await supabase
        .from("delegates")
        .select("id")
        .in("id", delegateIds);

      if (derr) return json(500, { ok: false, stage, error: derr.message });

      const found = new Set((dels || []).map((d: any) => String(d.id)));
      const missing = delegateIds.filter((id) => !found.has(id));
      if (missing.length) {
        return json(400, {
          ok: false,
          stage,
          error: `delegate_id not found: ${missing.join(", ")}`,
        });
      }
    }

    // Lookup invoice_id -> client_id
    stage = "lookup_invoices";
    const invoiceIds = clean.map((u) => u.invoice_id);
    const { data: invRows, error: invErr } = await supabase
      .from("invoices")
      .select("id, client_id")
      .in("id", invoiceIds);

    if (invErr) return json(500, { ok: false, stage, error: invErr.message });

    const invMap = new Map<string, string | null>();
    for (const r of invRows || [])
      invMap.set(String(r.id), r.client_id ? String(r.client_id) : null);

    const results: any[] = [];
    let okCount = 0;

    const clientDelegateToApply = new Map<string, string | null>();

    stage = "apply_updates";
    for (const u of clean) {
      const invoice_id = u.invoice_id;
      const client_id = invMap.get(invoice_id) ?? null;

      try {
        const patch: any = {};
        if (u.is_paid !== undefined) patch.is_paid = u.is_paid; // ✅ boolean real
        if (u.source_channel) patch.source_channel = u.source_channel;
        if (u.delegate_id !== undefined) patch.delegate_id = u.delegate_id;

        if (Object.keys(patch).length) {
          const { error: upInvErr } = await supabase
            .from("invoices")
            .update(patch)
            .eq("id", invoice_id);
          if (upInvErr) throw new Error(upInvErr.message);
        }

        if (u.apply_delegate_to_client) {
          if (!client_id)
            throw new Error(
              "Invoice has no client_id; cannot apply delegate to client"
            );
          const delId =
            u.delegate_id === undefined ? null : u.delegate_id ?? null;
          clientDelegateToApply.set(client_id, delId);
        }

        okCount++;
        results.push({ ok: true, invoice_id });
      } catch (e: any) {
        results.push({ ok: false, invoice_id, error: e?.message || String(e) });
      }
    }

    stage = "apply_delegate_to_client";
    for (const [client_id, delId] of clientDelegateToApply.entries()) {
      try {
        const { error: upClientErr } = await supabase
          .from("clients")
          .update({ delegate_id: delId })
          .eq("id", client_id);
        if (upClientErr) throw new Error(upClientErr.message);

        const { error: backfillErr } = await supabase
          .from("invoices")
          .update({ delegate_id: delId })
          .eq("client_id", client_id);
        if (backfillErr) throw new Error(backfillErr.message);
      } catch (e: any) {
        results.push({
          ok: false,
          stage: "apply_delegate_to_client",
          client_id,
          error: e?.message || String(e),
        });
      }
    }

    const errors = results.filter((r) => r.ok === false).length;

    return json(200, {
      ok: errors === 0,
      summary: { total: clean.length, ok: okCount, errors },
      results,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message || String(e) });
  }
}
