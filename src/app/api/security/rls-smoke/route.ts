import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  return url;
}

function getAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)");
  return key;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice("bearer ".length).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization: Bearer <access_token>" },
        { status: 401 }
      );
    }

    const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) auth.uid() (via RPC call to a tiny SQL inline? can't from client)
    // We'll infer by asking Supabase who the user is.
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return NextResponse.json({ ok: false, step: "getUser", error: userErr }, { status: 401 });

    // 2) current actor context + role (your DB functions)
    const actorId = await supabase.rpc("current_actor_id");
    const actorRole = await supabase.rpc("current_actor_role");

    // 3) counts (must respect RLS)
    const actorRolesCount = await supabase.from("actor_roles").select("*", { count: "exact", head: true });
    const clientsCount = await supabase.from("clients").select("*", { count: "exact", head: true });
    const invoicesCount = await supabase.from("invoices").select("*", { count: "exact", head: true });

    // 4) sample invoice ids (scoped)
    const invoicesSample = await supabase
      .from("invoices")
      .select("id, invoice_number, client_id")
      .order("invoice_date", { ascending: false })
      .limit(5);

    return NextResponse.json({
      ok: true,
      auth: {
        user_id: userData.user?.id ?? null,
        email: userData.user?.email ?? null,
      },
      ctx: {
        current_actor_id: actorId.data ?? null,
        current_actor_role: actorRole.data ?? null,
        current_actor_id_error: actorId.error ?? null,
        current_actor_role_error: actorRole.error ?? null,
      },
      rls_counts: {
        actor_roles: { count: actorRolesCount.count ?? null, error: actorRolesCount.error ?? null },
        clients: { count: clientsCount.count ?? null, error: clientsCount.error ?? null },
        invoices: { count: invoicesCount.count ?? null, error: invoicesCount.error ?? null },
      },
      invoices_sample: {
        rows: invoicesSample.data ?? null,
        error: invoicesSample.error ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}