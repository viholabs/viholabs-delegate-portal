// src/app/api/delegate/summary/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

function isMonth01(s: string) {
  return /^\d{4}-\d{2}-01$/.test(s);
}

function monthRange(month01: string) {
  const d = new Date(`${month01}T00:00:00.000Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: end.toISOString(), monthKey: month01.slice(0, 7) };
}

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

type SummaryResponse = {
  ok: boolean;
  month: string;
  mode: "self" | "supervision";
  actor?: { id: string; role: string; name: string | null; email: string | null };

  delegate?: { id: string; name: string | null; email: string | null };

  totals?: {
    invoices_paid: number;
    invoices_unpaid: number;

    units_sale_paid: number;
    units_sale_unpaid: number;

    units_promotion_paid: number;
    units_promotion_unpaid: number;

    total_net_paid: number;
    total_net_unpaid: number;

    last_invoice_paid_at: string | null;
  };

  top_clients?: Array<{
    client: { id: string; name: string | null; tax_id: string | null; contact_email?: string | null };
    units_paid: number;
    net_paid: number;
    invoices_paid: number;
    last_paid_at: string | null;
  }>;

  recommender_tree?: Array<{
    recommender: { id: string; name: string | null; tax_id: string | null };
    referred: { id: string; name: string | null; tax_id: string | null };
    percentage: number;
    active: boolean;
    mode: string | null;
  }>;

  sleeping_clients?: Array<{
    client: { id: string; name: string | null; contact_email?: string | null };
    days_since_last: number;
    severity: "warn" | "risk" | "critical";
  }>;
};

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");

  const month = (url.searchParams.get("month") ?? "").trim() || new Date().toISOString().slice(0, 7) + "-01";
  if (!isMonth01(month)) return json(422, { ok: false, error: "month inválido (YYYY-MM-01)" });

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supa: r.supa,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    const mode: "self" | "supervision" = delegateIdQuery ? "supervision" : "self";

    // Delegate info (opcional, no rompe si no hay columnas)
    let delegateInfo: any = null;
    try {
      const { data: d } = await r.supa
        .from("delegates")
        .select("id, name, email")
        .eq("id", delegateId)
        .maybeSingle();
      delegateInfo = d ?? { id: delegateId, name: null, email: null };
    } catch {
      delegateInfo = { id: delegateId, name: null, email: null };
    }

    // Clientes del delegate
    const { data: clientsRows, error: cErr } = await r.supa
      .from("clients")
      .select("id, name, tax_id, contact_email, status, delegate_id, created_at")
      .eq("delegate_id", delegateId);

    if (cErr) return json(500, { ok: false, stage: "clients", error: cErr.message });

    const clients = clientsRows ?? [];
    const clientById = new Map<string, any>();
    for (const c of clients) clientById.set(String((c as any).id), c);

    // Facturas del mes (por invoice_date + fallback source_month)
    const { startISO, endISO, monthKey } = monthRange(month);

    const byDateBase = r.supa
      .from("invoices")
      .select("id, is_paid, invoice_date, client_id, total_net, total_gross, source_month, delegate_id")
      .eq("delegate_id", delegateId)
      .gte("invoice_date", startISO)
      .lt("invoice_date", endISO);

    const bySourceBase = r.supa
      .from("invoices")
      .select("id, is_paid, invoice_date, client_id, total_net, total_gross, source_month, delegate_id")
      .eq("delegate_id", delegateId)
      .eq("source_month", monthKey);

    const [byDateRes, bySourceRes] = await Promise.all([byDateBase, bySourceBase]);

    if (byDateRes.error) return json(500, { ok: false, stage: "invoices_by_date", error: byDateRes.error.message });
    if (bySourceRes.error)
      return json(500, { ok: false, stage: "invoices_by_source", error: bySourceRes.error.message });

    const invMap = new Map<string, any>();
    for (const inv of byDateRes.data ?? []) invMap.set(String((inv as any).id), inv);
    for (const inv of bySourceRes.data ?? []) invMap.set(String((inv as any).id), inv);

    const invoicesMonth = Array.from(invMap.values());

    const allInvoiceIds = invoicesMonth.map((x: any) => String(x.id));
    const paidInvoiceIds = invoicesMonth.filter((x: any) => !!x.is_paid).map((x: any) => String(x.id));
    const paidSet = new Set<string>(paidInvoiceIds);

    // Items del mes (si existen)
    let itemsMonth: any[] = [];
    if (allInvoiceIds.length) {
      const itemsRes = await r.supa
        .from("invoice_items")
        .select("invoice_id, units, line_type")
        .in("invoice_id", allInvoiceIds);

      if (itemsRes.error) return json(500, { ok: false, stage: "items_month", error: itemsRes.error.message });
      itemsMonth = itemsRes.data ?? [];
    }

    // Totales
    let invoices_paid = 0;
    let invoices_unpaid = 0;

    let total_net_paid = 0;
    let total_net_unpaid = 0;

    let last_invoice_paid_at: string | null = null;

    for (const inv of invoicesMonth) {
      const isPaid = !!inv.is_paid;
      if (isPaid) invoices_paid += 1;
      else invoices_unpaid += 1;

      const net = toNum(inv.total_net, 0);
      if (isPaid) total_net_paid += net;
      else total_net_unpaid += net;

      if (isPaid && inv.invoice_date) {
        const d = String(inv.invoice_date);
        if (!last_invoice_paid_at || d > last_invoice_paid_at) last_invoice_paid_at = d;
      }
    }

    let units_sale_paid = 0;
    let units_sale_unpaid = 0;
    let units_promotion_paid = 0;
    let units_promotion_unpaid = 0;

    for (const it of itemsMonth) {
      const invId = String(it.invoice_id);
      const units = toInt(it.units, 0);
      const lt = String(it.line_type ?? "").toLowerCase().trim(); // "sale" | "promotion" (según tu lógica)

      const isPaid = paidSet.has(invId);
      const isPromo = lt === "promotion" || lt === "promo" || lt === "foc";
      const isSale = !isPromo; // fallback

      if (isSale) {
        if (isPaid) units_sale_paid += units;
        else units_sale_unpaid += units;
      } else {
        if (isPaid) units_promotion_paid += units;
        else units_promotion_unpaid += units;
      }
    }

    // Top clients (por ventas cobradas)
    const byClient = new Map<string, { units: number; net: number; invoices: number; last: string | null }>();

    // net por cliente (paid)
    for (const inv of invoicesMonth) {
      if (!inv.is_paid) continue;
      const cid = inv.client_id ? String(inv.client_id) : "";
      if (!cid) continue;

      const cur = byClient.get(cid) ?? { units: 0, net: 0, invoices: 0, last: null };
      cur.net += toNum(inv.total_net, 0);
      cur.invoices += 1;
      const d = inv.invoice_date ? String(inv.invoice_date) : null;
      if (d && (!cur.last || d > cur.last)) cur.last = d;
      byClient.set(cid, cur);
    }

    // units por cliente (paid)
    for (const it of itemsMonth) {
      const invId = String(it.invoice_id);
      if (!paidSet.has(invId)) continue;

      const inv = invMap.get(invId);
      const cid = inv?.client_id ? String(inv.client_id) : "";
      if (!cid) continue;

      const lt = String(it.line_type ?? "").toLowerCase().trim();
      const isPromo = lt === "promotion" || lt === "promo" || lt === "foc";
      if (isPromo) continue; // top clients por venta pagada

      const cur = byClient.get(cid) ?? { units: 0, net: 0, invoices: 0, last: null };
      cur.units += toInt(it.units, 0);
      byClient.set(cid, cur);
    }

    const top_clients = Array.from(byClient.entries())
      .map(([clientId, agg]) => {
        const c = clientById.get(clientId);
        return {
          client: {
            id: clientId,
            name: (c as any)?.name ?? null,
            tax_id: (c as any)?.tax_id ?? null,
            contact_email: (c as any)?.contact_email ?? null,
          },
          units_paid: agg.units,
          net_paid: agg.net,
          invoices_paid: agg.invoices,
          last_paid_at: agg.last,
        };
      })
      .sort((a, b) => b.net_paid - a.net_paid)
      .slice(0, 6);

    // Recommender tree (si tabla existe)
    let recommender_tree: SummaryResponse["recommender_tree"] = [];
    try {
      const { data: recos } = await r.supa
        .from("client_recommendations")
        .select("recommender_client_id, referred_client_id, percentage, active, mode")
        .eq("active", true);

      const rows = recos ?? [];
      recommender_tree = rows
        .map((x: any) => {
          const recommender = clientById.get(String(x.recommender_client_id));
          const referred = clientById.get(String(x.referred_client_id));
          if (!recommender || !referred) return null;

          return {
            recommender: {
              id: String(x.recommender_client_id),
              name: (recommender as any)?.name ?? null,
              tax_id: (recommender as any)?.tax_id ?? null,
            },
            referred: {
              id: String(x.referred_client_id),
              name: (referred as any)?.name ?? null,
              tax_id: (referred as any)?.tax_id ?? null,
            },
            percentage: toNum(x.percentage, 0),
            active: !!x.active,
            mode: x.mode ? String(x.mode) : null,
          };
        })
        .filter(Boolean) as any;
    } catch {
      recommender_tree = [];
    }

    // Sleeping clients (última factura por cliente)
    let sleeping_clients: SummaryResponse["sleeping_clients"] = [];
    try {
      const { data: lastInvRows } = await r.supa
        .from("invoices")
        .select("client_id, invoice_date")
        .eq("delegate_id", delegateId)
        .order("invoice_date", { ascending: false })
        .limit(500);

      const lastByClient = new Map<string, string>();
      for (const row of lastInvRows ?? []) {
        const cid = (row as any).client_id ? String((row as any).client_id) : "";
        const d = (row as any).invoice_date ? String((row as any).invoice_date) : "";
        if (!cid || !d) continue;
        if (!lastByClient.has(cid)) lastByClient.set(cid, d);
      }

      const now = new Date();
      const cutoffWarn = 30;
      const cutoffRisk = 60;
      const cutoffCritical = 90;

      for (const c of clients) {
        const cid = String((c as any).id);
        const last = lastByClient.get(cid) ?? null;
        if (!last) continue;

        const lastDate = new Date(String(last));
        const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (days >= cutoffWarn) {
          const severity = days >= cutoffCritical ? "critical" : days >= cutoffRisk ? "risk" : "warn";
          sleeping_clients.push({
            client: {
              id: cid,
              name: String((c as any).name ?? "—"),
              contact_email: (c as any).contact_email ?? null,
            },
            days_since_last: days,
            severity,
          });
        }
      }

      sleeping_clients.sort((a, b) => b.days_since_last - a.days_since_last);
      sleeping_clients = sleeping_clients.slice(0, 12);
    } catch {
      sleeping_clients = [];
    }

    const resp: SummaryResponse = {
      ok: true,
      month,
      mode,
      actor: { id: r.actor.id, role: String(r.actor.role ?? ""), name: (r.actor as any).name ?? null, email: (r.actor as any).email ?? null },
      delegate: { id: delegateInfo?.id ?? delegateId, name: delegateInfo?.name ?? null, email: delegateInfo?.email ?? null },
      totals: {
        invoices_paid,
        invoices_unpaid,
        units_sale_paid,
        units_sale_unpaid,
        units_promotion_paid,
        units_promotion_unpaid,
        total_net_paid,
        total_net_unpaid,
        last_invoice_paid_at,
      },
      top_clients,
      recommender_tree,
      sleeping_clients,
    };

    return NextResponse.json(resp);
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Error inesperado" });
  }
}
