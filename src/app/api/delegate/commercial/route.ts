import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isValidMonthYYYYMM01(value: string) {
  return /^\d{4}-\d{2}-01$/.test(value);
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
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

async function getUserFromTokenOrThrow(url: string, anonKey: string, token: string) {
  const supaAuth = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supaAuth.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data?.user?.id) throw new Error("Usuario no autenticado");
  return data.user;
}

async function getActorByAuthUserIdOrThrow(supaSvc: any, authUserId: string) {
  const { data: actor, error: actorErr } = await supaSvc
    .from("actors")
    .select("id, role, status, name, email, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (actorErr) throw new Error(actorErr.message);
  if (!actor?.id) throw new Error("Actor no encontrado");
  if (String(actor.status ?? "") !== "active") throw new Error("Actor inactivo");
  return actor;
}

export async function POST(req: NextRequest) {
  const stageBase = "api/delegate/commercial";
  let stage = stageBase;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anon || !service) {
      return json(500, { ok: false, stage: `${stageBase}:env`, error: "Faltan variables de entorno" });
    }

    const body = await req.json().catch(() => null);
    const month = String(body?.month ?? "");
    const delegate_id_input = body?.delegate_id ? String(body.delegate_id) : null;

    if (!isValidMonthYYYYMM01(month)) {
      return json(422, { ok: false, stage: `${stageBase}:input`, error: "month inválido (YYYY-MM-01)" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return json(401, { ok: false, stage: `${stageBase}:auth`, error: "Falta Authorization Bearer token" });
    }

    const user = await getUserFromTokenOrThrow(url, anon, token);
    const supabase = createClient(url, service, { auth: { persistSession: false } });
    const actor = await getActorByAuthUserIdOrThrow(supabase, user.id);

    // Resolver delegate
    stage = "resolve_delegate";
    let mode: "self" | "supervision" = "self";
    let delegate: any = null;

    if (delegate_id_input) {
      mode = "supervision";
      if (!["admin", "superadmin"].includes(String(actor.role ?? ""))) {
        return json(403, { ok: false, stage, error: "No autorizado para modo supervisión" });
      }
      const { data, error } = await supabase
        .from("delegates")
        .select("id, actor_id, name, email, created_at")
        .eq("id", delegate_id_input)
        .maybeSingle();

      if (error) return json(500, { ok: false, stage, error: error.message });
      if (!data?.id) return json(404, { ok: false, stage, error: "Delegate no encontrado" });
      delegate = data;
    } else {
      if (["admin", "superadmin"].includes(String(actor.role ?? ""))) {
        return json(422, {
          ok: false,
          stage,
          error: "Modo supervisión: falta delegate_id. Entra con /delegate/dashboard?delegateId=UUID",
        });
      }

      const { data, error } = await supabase
        .from("delegates")
        .select("id, actor_id, name, email, created_at")
        .eq("actor_id", actor.id)
        .maybeSingle();

      if (error) return json(500, { ok: false, stage, error: error.message });
      if (!data?.id) return json(404, { ok: false, stage, error: "Delegate no encontrado para este actor" });
      delegate = data;
    }

    // Clientes del delegate
    stage = "clients";
    const { data: clientsRows, error: cErr } = await supabase
      .from("clients")
      .select("id, name, contact_email, delegate_id")
      .eq("delegate_id", delegate.id);

    if (cErr) return json(500, { ok: false, stage, error: cErr.message });

    const clientIds = (clientsRows ?? []).map((c: any) => String(c.id)).filter(Boolean);

    const applyOwnershipFilter = (q: any) => {
      if (clientIds.length > 0) {
        const inList = `(${clientIds.join(",")})`;
        return q.or(`delegate_id.eq.${delegate.id},client_id.in.${inList}`);
      }
      return q.eq("delegate_id", delegate.id);
    };

    // Facturas del mes
    stage = "invoices_month";
    const { startISO, endISO } = monthRange(month);
    const monthKey = month.slice(0, 7);

    const byDateBase = supabase
      .from("invoices")
      .select("id, is_paid, invoice_date, client_id, total_net, delegate_id, source_month")
      .gte("invoice_date", startISO)
      .lt("invoice_date", endISO);

    const bySourceBase = supabase
      .from("invoices")
      .select("id, is_paid, invoice_date, client_id, total_net, delegate_id, source_month")
      .eq("source_month", monthKey);

    const [byDateRes, bySourceRes] = await Promise.all([
      applyOwnershipFilter(byDateBase),
      applyOwnershipFilter(bySourceBase),
    ]);

    if (byDateRes.error) return json(500, { ok: false, stage, error: byDateRes.error.message });
    if (bySourceRes.error) return json(500, { ok: false, stage, error: bySourceRes.error.message });

    const invMap = new Map<string, any>();
    for (const inv of byDateRes.data ?? []) invMap.set(String(inv.id), inv);
    for (const inv of bySourceRes.data ?? []) invMap.set(String(inv.id), inv);
    const invoicesMonth = Array.from(invMap.values());

    const paidInvoiceIds = invoicesMonth.filter((x: any) => !!x.is_paid).map((x: any) => String(x.id));
    const allInvoiceIds = invoicesMonth.map((x: any) => String(x.id));

    // Items
    stage = "items_month";
    let itemsMonth: any[] = [];
    if (allInvoiceIds.length > 0) {
      const itemsRes = await supabase
        .from("invoice_items")
        .select("invoice_id, units, line_type")
        .in("invoice_id", allInvoiceIds);

      if (itemsRes.error) return json(500, { ok: false, stage, error: itemsRes.error.message });
      itemsMonth = itemsRes.data ?? [];
    }

    const paidSet = new Set<string>(paidInvoiceIds);

    // Top clients (por ventas cobradas)
    stage = "top_clients";
    const byClient = new Map<string, { units: number; base: number; invoices: number; last: string | null }>();

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

    // Recommender tree (si existe client_recommendations)
    stage = "recommender_tree";
    const recommender_tree: any[] = [];

    if (clientIds.length > 0) {
      const { data: recs, error: recErr } = await supabase
        .from("client_recommendations")
        .select("id, mode, percentage, recommender_client_id, referred_client_id, active")
        .eq("active", true)
        .in("referred_client_id", clientIds);

      if (recErr) return json(500, { ok: false, stage, error: recErr.message });

      for (const r of recs ?? []) {
        const recommId = String((r as any).recommender_client_id);
        const refId = String((r as any).referred_client_id);
        const perc = toNum((r as any).percentage, 0);
        const modeR = String((r as any).mode ?? "deduct") as "deduct" | "additive";

        // Impacto del mes: ventas cobradas del referido
        let units_sale_paid = 0;
        let base_paid = 0;

        for (const inv of invoicesMonth) {
          if (!inv.client_id) continue;
          if (String(inv.client_id) !== refId) continue;
          if (!!inv.is_paid) base_paid += toNum(inv.total_net, 0);
        }

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

    // Sleeping clients (>= 30/60/90 días sin factura)
    stage = "sleeping_clients";
    const sleeping_clients: Array<any> = [];
    const cutoffWarn = 30;
    const cutoffRisk = 60;
    const cutoffCritical = 90;

    if (clientIds.length > 0) {
      const { data: lastInvRows, error: lastInvErr } = await supabase
        .from("invoices")
        .select("client_id, invoice_date")
        .in("client_id", clientIds)
        .order("invoice_date", { ascending: false });

      if (lastInvErr) return json(500, { ok: false, stage, error: lastInvErr.message });

      const lastByClient = new Map<string, string>();
      for (const r of lastInvRows ?? []) {
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
      top_clients,
      recommender_tree,
      sleeping_clients,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
