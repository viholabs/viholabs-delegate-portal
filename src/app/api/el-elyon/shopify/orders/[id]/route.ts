import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await resolveDashboardContext(req);
    if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
    if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

    const { id } = await params;
    const supa = ctx.supaService;

    const { data: order, error: orderError } = await supa
      .from("shopify_orders_raw")
      .select("*")
      .eq("id", id)
      .single();

    if (orderError || !order) return json(404, { ok: false, error: "Pedido no encontrado" });

    // Enrich with client
    let client: { id: string; name: string | null; contact_email: string | null; status: string | null } | null = null;
    if (order.client_id) {
      const { data } = await supa
        .from("clients")
        .select("id, name, contact_email, status")
        .eq("id", order.client_id)
        .single();
      client = data;
    }

    // Find Holded invoices for this client near the order date (±21 days)
    let holdedInvoices: unknown[] = [];
    if (order.client_id && order.processed_at) {
      const orderDate = new Date(order.processed_at);
      const dateMin = new Date(orderDate.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const dateMax = new Date(orderDate.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const { data: invoices } = await supa
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_net, total_gross, is_paid, paid_date, external_invoice_id, document_type")
        .eq("client_id", order.client_id)
        .gte("invoice_date", dateMin)
        .lte("invoice_date", dateMax)
        .order("invoice_date", { ascending: false });

      holdedInvoices = invoices ?? [];
    }

    // If no client match, try to find client candidates by email
    let emailCandidates: unknown[] = [];
    if (!order.client_id && order.email) {
      const { data: candidates } = await supa
        .from("clients")
        .select("id, name, contact_email, status")
        .ilike("contact_email", order.email)
        .limit(5);
      emailCandidates = candidates ?? [];
    }

    return json(200, {
      ok: true,
      order,
      client,
      holded_invoices: holdedInvoices,
      email_candidates: emailCandidates,
    });
  } catch (err: unknown) {
    return json(500, { ok: false, error: String(err) });
  }
}
