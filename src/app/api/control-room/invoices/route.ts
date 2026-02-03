// src/app/api/control-room/invoices/route.ts
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

function toMonthStringFromDateYYYYMM01(value: string) {
  // UI te está pasando "2026-01-01" -> lo convertimos a "2026-01"
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-01$/);
  if (m) return `${m[1]}-${m[2]}`;
  // por si ya viene "YYYY-MM"
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return "";
}

export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return json(500, {
        ok: false,
        error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      });
    }

    const token = getBearerToken(req);
    if (!token) return json(401, { ok: false, error: "Missing Bearer token" });

    // Validar token usuario
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) return json(401, { ok: false, error: "Invalid token" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const monthParam = url.searchParams.get("month") || ""; // UI: "2026-01-01"
    const q = (url.searchParams.get("q") || "").trim();

    const month = toMonthStringFromDateYYYYMM01(monthParam);
    if (!month) {
      return json(400, {
        ok: false,
        error: "Invalid month. Expected YYYY-MM-01 or YYYY-MM",
        received: monthParam,
      });
    }

    // Base query
    let query = supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        invoice_date,
        source_month,
        is_paid,
        source_channel,
        needs_review,
        total_net,
        total_gross,
        client_id,
        client_name,
        client_name_raw,
        created_at,
        updated_at,
        clients:client_id (
          id,
          name,
          tax_id,
          delegate_id
        )
      `
      )
      .eq("source_month", month)
      .order("invoice_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    // búsqueda por número factura o cliente
    if (q) {
      // Nota: Supabase OR necesita sintaxis "col.ilike.%...%"
      // Buscamos por invoice_number y por client_name/client_name_raw
      const like = `%${q}%`;
      query = query.or(
        `invoice_number.ilike.${like},client_name.ilike.${like},client_name_raw.ilike.${like}`
      );
    }

    const { data: invoices, error } = await query;
    if (error) return json(500, { ok: false, error: error.message });

    const rows = invoices || [];

    // KPIs rápidos para la pantalla (puedes ajustarlos luego)
    const total = rows.length;
    const paid = rows.filter((r: any) => r.is_paid === true).length;
    const unpaid = rows.filter((r: any) => r.is_paid === false).length;

    // "Total bruto (suma)" en tu UI: si no lo usas, igual lo dejamos para que no rompa el widget
    const total_gross_sum = rows.reduce((acc: number, r: any) => {
      const v = Number(r.total_gross ?? 0);
      return Number.isFinite(v) ? acc + v : acc;
    }, 0);

    return json(200, {
      ok: true,
      month,
      q,
      kpis: {
        total_invoices: total,
        paid,
        unpaid,
        total_gross_sum: Math.round(total_gross_sum * 100) / 100,
      },
      invoices: rows,
    });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}
