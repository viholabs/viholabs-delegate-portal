// src/app/api/control-room/invoices/bulk/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
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

async function requireAuthOrThrow(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing Bearer token" };
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "Invalid token" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return { ok: true as const, supabase, user: userData.user };
}

type BulkUpdate = {
  invoice_id: string;
  is_paid?: boolean;
  source_channel?: string;
  delegate_id?: string | null; // delegates.id
  apply_delegate_to_client?: boolean;
};

export async function POST(req: Request) {
  try {
    const auth = await requireAuthOrThrow(req);
    if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

    const supabase = auth.supabase;

    const body = await req.json().catch(() => null);
    const updates: BulkUpdate[] = Array.isArray(body?.updates) ? body.updates : [];

    if (!updates.length) return json(400, { ok: false, error: "Missing updates[]" });

    const clean: BulkUpdate[] = updates
      .map((u: any) => {
        const isPaidParsed = parseBoolStrict(u?.is_paid);
        return {
          invoice_id: safeStr(u?.invoice_id),
          is_paid: isPaidParsed, // ✅ aquí: false es false
          source_channel: safeStr(u?.source_channel || ""),
          delegate_id:
            u?.delegate_id === null ? null : u?.delegate_id ? safeStr(u.delegate_id) : undefined,
          apply_delegate_to_client: !!u?.apply_delegate_to_client,
        };
      })
      .filter((u) => !!u.invoice_id);

    if (!clean.length) return json(400, { ok: false, error: "All updates missing invoice_id" });

    // Validar delegates existentes
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

      if (derr) return json(500, { ok: false, error: derr.message });

      const found = new Set((dels || []).map((d: any) => String(d.id)));
      const missing = delegateIds.filter((id) => !found.has(id));
      if (missing.length) {
        return json(400, { ok: false, error: `delegate_id not found: ${missing.join(", ")}` });
      }
    }

    // Lookup invoice_id -> client_id
    const invoiceIds = clean.map((u) => u.invoice_id);
    const { data: invRows, error: invErr } = await supabase
      .from("invoices")
      .select("id, client_id")
      .in("id", invoiceIds);

    if (invErr) return json(500, { ok: false, error: invErr.message });

    const invMap = new Map<string, string | null>();
    for (const r of invRows || []) invMap.set(String(r.id), r.client_id ? String(r.client_id) : null);

    const results: any[] = [];
    let okCount = 0;

    const clientDelegateToApply = new Map<string, string | null>();

    for (const u of clean) {
      const invoice_id = u.invoice_id;
      const client_id = invMap.get(invoice_id) ?? null;

      try {
        const patch: any = {};
        if (u.is_paid !== undefined) patch.is_paid = u.is_paid; // ✅ ya viene boolean real
        if (u.source_channel) patch.source_channel = u.source_channel;
        if (u.delegate_id !== undefined) patch.delegate_id = u.delegate_id;

        if (Object.keys(patch).length) {
          const { error: upInvErr } = await supabase.from("invoices").update(patch).eq("id", invoice_id);
          if (upInvErr) throw new Error(upInvErr.message);
        }

        if (u.apply_delegate_to_client) {
          if (!client_id) throw new Error("Invoice has no client_id; cannot apply delegate to client");
          const delId = u.delegate_id === undefined ? null : (u.delegate_id ?? null);
          clientDelegateToApply.set(client_id, delId);
        }

        okCount++;
        results.push({ ok: true, invoice_id });
      } catch (e: any) {
        results.push({ ok: false, invoice_id, error: e?.message || String(e) });
      }
    }

    for (const [client_id, delId] of clientDelegateToApply.entries()) {
      try {
        const { error: upClientErr } = await supabase.from("clients").update({ delegate_id: delId }).eq("id", client_id);
        if (upClientErr) throw new Error(upClientErr.message);

        const { error: backfillErr } = await supabase.from("invoices").update({ delegate_id: delId }).eq("client_id", client_id);
        if (backfillErr) throw new Error(backfillErr.message);
      } catch (e: any) {
        results.push({ ok: false, stage: "apply_delegate_to_client", client_id, error: e?.message || String(e) });
      }
    }

    const errors = results.filter((r) => r.ok === false).length;

    return json(200, {
      ok: errors === 0,
      summary: { total: clean.length, ok: okCount, errors },
      results,
    });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}
