import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const month =
      searchParams.get("month") ||
      searchParams.get("source_month") ||
      new Date().toISOString().slice(0, 7);

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        invoice_date,
        client_id,
        client_name,
        delegate_id,
        source_provider,
        external_invoice_id,
        holded_contact_id,
        state_code,
        source_month,
        total_net,
        total_gross,
        currency,
        is_paid,
        paid_date
      `)
      .eq("source_provider", "holded")
      .eq("source_month", month)
      .order("invoice_date", { ascending: false })
      .order("invoice_number", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      month,
      count: data?.length ?? 0,
      rows: data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}