// src/app/api/delegate/commercial/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getActorFromRequest, resolveDelegateIdOrThrow } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isValidMonthYYYYMM01(value: string) {
  return /^\d{4}-\d{2}-01$/.test(value);
}

function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

type LineType = "sale" | "foc" | "promo" | "unknown";
function normLineType(v: any): LineType {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "sale" || s === "venta") return "sale";
  if (s === "foc" || s === "free") return "foc";
  if (s === "promo" || s === "promotion" || s === "promocion") return "promo";
  return "unknown";
}

function monthRange(month01: string) {
  const start = new Date(`${month01}T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0));
  return {
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
  };
}

export async function POST(req: NextRequest) {
  const stageBase = "api/delegate/commercial";
  let stage = stageBase;

  try {
    const body = await req.json().catch(() => null);
    const month = String(body?.month ?? "");
    const delegate_id_input = body?.delegate_id ? String(body.delegate_id) : null;

    if (!isValidMonthYYYYMM01(month)) {
      return json(422, { ok: false, stage: `${stageBase}:input`, error: "month inválido (YYYY-MM-01)" });
    }

    // 1) Actor + clientes supabase (RLS + Service) desde _utils
    const ar = await getActorFromRequest(req);
    if (!ar.ok) return json(ar.status, { ok: false, stage: `${stageBase}:auth`, error: ar.error });

    const { actor, supaRls } = ar;

    // 2) Resolver delegateId (self o supervision)
    stage = "resolve_delegate";
    const delegateId = await resolveDelegateIdOrThrow({
      supaRls,
      actor,
      delegateIdFromQuery: delegate_id_input,
    });

    const mode: "self" | "supervision" = delegate_id_input ? "supervision" : "self";

    // 3) Cargar clientes del delegado (RLS filtra)
    stage = "clients";
    const clientsRes = await supaRls
      .from("clients")
      .select("id, name, contact_email, delegate_id")
      .eq("delegate_id", delegateId);

    if (clientsRes.error) return json(500, { ok: false, stage, error: clientsRes.error.message });

    const clientsRows = clientsRes.data ?? [];
    const clientIds = clientsRows.map((c: any) => String(c.id)).filter(Boolean);

    // 4) Facturas del mes (dos estrategias: por fecha y por source_month), siempre RLS
    stage = "invoices_month";
    const { startISO, endISO } = monthRange(month);
    const monthKey = month.slice(0, 7);

    const invMap = new Map<string, any>();

    // 4a) Por fecha: preferimos por client_id (más robusto si delegate_id faltase)
    if (clientIds.length > 0) {
      const invByDate = await supaRls
        .from("invoices")
        .select("id, is_paid, invoice_date, client_id, total_net, delegate_id, source_month")
        .gte("invoice_date", startISO)
        .lt("invoice_date", endISO)
        .in("client_id", clientIds);

      if (invByDate.error) return json(500, { ok: false, stage, error: invByDate.error.message });
      for (const inv of invByDate.data ?? []) invMap.set(String(inv.id), inv);
    }

    // 4b) Por source_month (fallback para casos con invoice_date rara)
    if (clientIds.length > 0) {
      const invBySource = await supaRls
        .from("invoices")
        .select("id, is_paid, invoice_date, client_id, total_net, delegate_id, source_month")
        .eq("source_month", monthKey)
        .in("client_id", clientIds);

      if (invBySource.error) return json(500, { ok: false, stage, error: invBySource.error.message });
      for (const inv of invBySource.data ?? []) invMap.set(String(inv.id), inv);
    }

    const invoicesMonth = Array.from(invMap.values());
    const allInvoiceIds = invoicesMonth.map((x: any) => String(x.id)).filter(Boolean);
    const paidInvoiceIds = invoicesMonth.filter((x: any) => !!x.is_paid).map((x: any) => String(x.id));

    // 5) Items del mes (para unidades vendidas)
    stage = "items_month";
    let itemsMonth: any[] = [];
    if (allInvoiceIds.length > 0) {
      const itemsRes = await supaRls
        .from("invoice_items")
        .select("invoice_id, units, line_type")
        .in("invoice_id", allInvoiceIds);

      if (itemsRes.error) return json(500, { ok: false, stage, error: itemsRes.error.message });
      itemsMonth = itemsRes.data ?? [];
    }

    const paidSet = new Set<string>(paidInvoiceIds);

    // 6) Top clients (ventas cobradas + unidades cobradas)
    stage = "top_clients";
    const byClient = new Map<string, { units: number; base: number; invoices: number; last: string | null }>();

    // 6a) Base e invoices por cliente (solo cobradas)
    for (const inv of invoicesMonth) {
      if (!inv.client_id) continue;
      const cid = String(inv.client_id);
      const d = inv.invoice_date ? String(inv.invoice_date) : null;

      const prev = byClient.get(cid) ?? { units: 0, base: 0, invoices: 0, last: null };
      if (!!inv.is_paid) {
        prev.base += toNum(inv.total_net, 0);
        prev.invoices += 1;
      }
      if (d && (!prev.last || d > prev.last)) prev.last = d;
      byClient.set(cid, prev);
    }

    // 6b) Unidades vendidas por cliente (solo items sale y solo facturas cobradas)
    for (const it of itemsMonth) {
      const invId = String(it.invoice_id ?? "");
      if (!invId || !paidSet.has(invId)) continue;
      const lt = normLineType(it.line_type);
      if (lt !== "sale") continue;

      const inv = invMap.get(invId);
      const cid = inv?.client_id ? String(inv.client_id) : "";
      if (!cid) continue;

      const prev = byClient.get(cid) ?? { units: 0, base: 0, invoices: 0, last: null };
      prev.units += toNum(it.units, 0);
      byClient.set(cid, prev);
    }

    const clientsById = new Map<string, any>((clientsRows ?? []).map((c: any) => [String(c.id), c]));

    const top_clients = Array.from(byClient.entries())
      .map(([cid, agg]) => ({
        id: cid,
        name: String(clientsById.get(cid)?.name ?? "—"),
        units_sale_paid: agg.units,
        base_paid: agg.base,
        invoices_paid: agg.invoices,
        last_invoice_date: agg.last,
      }))
      .sort((a, b) => (b.units_sale_paid ?? 0) - (a.units_sale_paid ?? 0))
      .slice(0, 10);

    // 7) Recommender tree (si existe client_recommendations)
    stage = "recommender_tree";
    const recommender_tree: any[] = [];

    if (clientIds.length > 0) {
      const recsRes = await supaRls
        .from("client_recommendations")
        .select("id, mode, percentage, recommender_client_id, referred_client_id, active")
        .eq("active", true)
        .in("referred_client_id", clientIds);

      if (recsRes.error) return json(500, { ok: false, stage, error: recsRes.error.message });

      for (const r of recsRes.data ?? []) {
        const recommId = String((r as any).recommender_client_id);
        const refId = String((r as any).referred_client_id);
        const perc = toNum((r as any).percentage, 0);
        const modeR = String((r as any).mode ?? "deduct") as "deduct" | "additive";

        let units_sale_paid = 0;
        let base_paid = 0;

        // Base pagada del referido
        for (const inv of invoicesMonth) {
          if (!inv.client_id) continue;
          if (String(inv.client_id) !== refId) continue;
          if (!!inv.is_paid) base_paid += toNum(inv.total_net, 0);
        }

        // Unidades pagadas del referido
        for (const it of itemsMonth) {
          const invId = String(it.invoice_id ?? "");
          if (!invId || !paidSet.has(invId)) continue;
          const inv = invMap.get(invId);
          if (!inv?.client_id) continue;
          if (String(inv.client_id) !== refId) continue;
          if (normLineType(it.line_type) !== "sale") continue;
          units_sale_paid += toNum(it.units, 0);
        }

        const impact_amount = (base_paid * perc) / 100;

        recommender_tree.push({
          id: String((r as any).id),
          mode: modeR,
          percentage: perc,
          recommender: { id: recommId, name: String(clientsById.get(recommId)?.name ?? "—") },
          referred: { id: refId, name: String(clientsById.get(refId)?.name ?? "—") },
          month_sales: { units_sale_paid, base_paid, impact_amount },
        });
      }
    }

    // 8) Sleeping clients (>= 30/60/90 días sin factura)
    stage = "sleeping_clients";
    const sleeping_clients: Array<any> = [];
    const cutoffWarn = 30;
    const cutoffRisk = 60;
    const cutoffCritical = 90;

    if (clientIds.length > 0) {
      const lastInvRes = await supaRls
        .from("invoices")
        .select("client_id, invoice_date")
        .in("client_id", clientIds)
        .order("invoice_date", { ascending: false });

      if (lastInvRes.error) return json(500, { ok: false, stage, error: lastInvRes.error.message });

      const lastByClient = new Map<string, string>();
      for (const r of lastInvRes.data ?? []) {
        const cid = r.client_id ? String(r.client_id) : "";
        const d = r.invoice_date ? String(r.invoice_date) : "";
        if (!cid || !d) continue;
        if (!lastByClient.has(cid)) lastByClient.set(cid, d);
      }

      const now = new Date();
      for (const c of clientsRows ?? []) {
        const cid = String(c.id);
        const last = lastByClient.get(cid) ?? null;
        if (!last) continue;

        const lastDate = new Date(String(last));
        const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (days >= cutoffWarn) {
          const severity = days >= cutoffCritical ? "critical" : days >= cutoffRisk ? "risk" : "warn";
          sleeping_clients.push({
            client: { id: cid, name: String((c as any).name ?? "—"), contact_email: (c as any).contact_email ?? null },
            days_since_last: days,
            last_units: null,
            severity,
          });
        }
      }
    }

    sleeping_clients.sort((a, b) => b.days_since_last - a.days_since_last);

    return json(200, {
      ok: true,
      month,
      mode,
      delegate_id: delegateId,
      top_clients,
      recommender_tree,
      sleeping_clients,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
