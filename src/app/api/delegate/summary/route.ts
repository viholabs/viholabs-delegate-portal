// src/app/api/delegate/summary/route.ts
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

type RpcPermRow = { perm_code: string | null };

function isMonth01(s: string) {
  return /^\d{4}-\d{2}-01$/.test(s);
}

function monthRange(month01: string) {
  const d = new Date(`${month01}T00:00:00.000Z`);
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    monthKey: month01.slice(0, 7),
  };
}

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizePermCode(v: unknown) {
  return String(v ?? "").trim();
}

async function getPermsOrThrow(supaService: any, actorId: string) {
  const { data, error } = await supaService.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  if (error) throw new Error(`effective_permissions failed: ${error.message}`);

  const rows = (data ?? []) as RpcPermRow[];
  const codes = rows
    .map((r: RpcPermRow) => normalizePermCode(r?.perm_code))
    .filter((x: string) => x.length > 0);

  const isSuperAdmin = codes.includes("*");
  const perms = new Set<string>(codes);

  return {
    isSuperAdmin,
    has: (perm: string) => (isSuperAdmin ? true : perms.has(perm)),
  };
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

function daysBetweenUTC(aISO: string, bISO: string) {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = Math.abs(b - a);
  return Math.trunc(diff / (1000 * 60 * 60 * 24));
}

function severityFromDays(days: number): "warn" | "risk" | "critical" {
  if (days >= 90) return "critical";
  if (days >= 60) return "risk";
  return "warn";
}

export async function GET(req: Request) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const r: any = await getActorFromRequest(req);
    if (!r?.ok) {
      return json(r?.status ?? 401, {
        ok: false,
        stage,
        error: r?.error ?? "No autenticado",
      });
    }

    const url = new URL(req.url);
    const delegateIdQuery = url.searchParams.get("delegateId");

    const month =
      (url.searchParams.get("month") ?? "").trim() ||
      new Date().toISOString().slice(0, 7) + "-01";

    if (!isMonth01(month)) {
      return json(422, {
        ok: false,
        stage: "validate_month",
        error: "month inválido (YYYY-MM-01)",
      });
    }

    const actor = r.actor;
    const supaService = r.supaService;
    const supaRls = r.supaRls;

    stage = "effective_permissions";
    const perms = await getPermsOrThrow(supaService, String(actor.id));

    const mode: "self" | "supervision" = delegateIdQuery ? "supervision" : "self";

    stage = "authorize_supervision";
    if (mode === "supervision" && !perms.has("actors.read")) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (actors.read) para supervisión",
      });
    }

    stage = "resolve_delegate";
    const delegateId = await resolveDelegateIdOrThrow({
      supaRls,
      actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    stage = "delegate_info";
    let delegateInfo: { id: string; name: string | null; email: string | null } = {
      id: delegateId,
      name: null,
      email: null,
    };

    try {
      const { data: d } = await supaRls
        .from("delegates")
        .select("id, name, email")
        .eq("id", delegateId)
        .maybeSingle();

      if (d) {
        delegateInfo = {
          id: String((d as any).id ?? delegateId),
          name: (d as any).name ?? null,
          email: (d as any).email ?? null,
        };
      }
    } catch {
      // ignore
    }

    stage = "clients";
    const { data: clientsRows, error: cErr } = await supaRls
      .from("clients")
      .select("id, name, tax_id, contact_email, status, delegate_id, created_at")
      .eq("delegate_id", delegateId);

    if (cErr) return json(500, { ok: false, stage, error: cErr.message });

    const clients = clientsRows ?? [];
    const clientById = new Map<string, any>();
    for (const c of clients) clientById.set(String((c as any).id), c);
    const clientIds = clients.map((c: any) => String(c.id)).filter(Boolean);

    stage = "invoices_month";
    const { startISO, endISO, monthKey } = monthRange(month);

    const byDateBase = supaRls
      .from("invoices")
      .select("id, is_paid, invoice_date, client_id, total_net, total_gross, source_month, delegate_id")
      .eq("delegate_id", delegateId)
      .gte("invoice_date", startISO)
      .lt("invoice_date", endISO);

    const bySourceBase = supaRls
      .from("invoices")
      .select("id, is_paid, invoice_date, client_id, total_net, total_gross, source_month, delegate_id")
      .eq("delegate_id", delegateId)
      .eq("source_month", monthKey);

    const [byDateRes, bySourceRes] = await Promise.all([byDateBase, bySourceBase]);

    if (byDateRes.error)
      return json(500, { ok: false, stage: "invoices_by_date", error: byDateRes.error.message });
    if (bySourceRes.error)
      return json(500, { ok: false, stage: "invoices_by_source", error: bySourceRes.error.message });

    const invMap = new Map<string, any>();
    for (const inv of byDateRes.data ?? []) invMap.set(String((inv as any).id), inv);
    for (const inv of bySourceRes.data ?? []) invMap.set(String((inv as any).id), inv);

    const invoicesMonth = Array.from(invMap.values());

    const allInvoiceIds = invoicesMonth.map((x: any) => String(x.id));
    const paidInvoiceIds = invoicesMonth
      .filter((x: any) => x.is_paid === true)
      .map((x: any) => String(x.id));
    const paidSet = new Set<string>(paidInvoiceIds);

    stage = "items_month";
    let itemsMonth: any[] = [];
    if (allInvoiceIds.length) {
      const itemsRes = await supaRls
        .from("invoice_items")
        .select("invoice_id, units, line_type")
        .in("invoice_id", allInvoiceIds);

      if (itemsRes.error)
        return json(500, { ok: false, stage, error: itemsRes.error.message });
      itemsMonth = itemsRes.data ?? [];
    }

    stage = "totals";
    let invoices_paid = 0;
    let invoices_unpaid = 0;

    let total_net_paid = 0;
    let total_net_unpaid = 0;

    let last_invoice_paid_at: string | null = null;

    for (const inv of invoicesMonth) {
      const isPaid = inv.is_paid === true;
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
      const lt = String(it.line_type ?? "").toLowerCase().trim();

      const isPaid = paidSet.has(invId);
      const isPromo = lt === "promotion" || lt === "promo" || lt === "foc" || lt === "free";
      const isSale = !isPromo;

      if (isSale) {
        if (isPaid) units_sale_paid += units;
        else units_sale_unpaid += units;
      } else {
        if (isPaid) units_promotion_paid += units;
        else units_promotion_unpaid += units;
      }
    }

    stage = "top_clients";
    const byClient = new Map<string, { units: number; net: number; invoices: number; last: string | null }>();

    for (const inv of invoicesMonth) {
      if (inv.is_paid !== true) continue;
      const cid = inv.client_id ? String(inv.client_id) : "";
      if (!cid) continue;

      const cur = byClient.get(cid) ?? { units: 0, net: 0, invoices: 0, last: null };
      cur.net += toNum(inv.total_net, 0);
      cur.invoices += 1;
      const d = inv.invoice_date ? String(inv.invoice_date) : null;
      if (d && (!cur.last || d > cur.last)) cur.last = d;
      byClient.set(cid, cur);
    }

    for (const it of itemsMonth) {
      const invId = String(it.invoice_id);
      if (!paidSet.has(invId)) continue;

      const inv = invMap.get(invId);
      const cid = inv?.client_id ? String(inv.client_id) : "";
      if (!cid) continue;

      const lt = String(it.line_type ?? "").toLowerCase().trim();
      const isPromo = lt === "promotion" || lt === "promo" || lt === "foc" || lt === "free";
      if (isPromo) continue;

      const cur = byClient.get(cid) ?? { units: 0, net: 0, invoices: 0, last: null };
      cur.units += toInt(it.units, 0);
      byClient.set(cid, cur);
    }

    const top_clients = Array.from(byClient.entries())
      .map(([clientId, agg]: [string, { units: number; net: number; invoices: number; last: string | null }]) => {
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
      .sort((a: any, b: any) => (b.net_paid ?? 0) - (a.net_paid ?? 0))
      .slice(0, 6);

    stage = "recommender_tree";
    const recommender_tree: SummaryResponse["recommender_tree"] = [];

    stage = "sleeping_clients";
    const nowISO = new Date().toISOString();

    const lastByClient = new Map<string, string>();
    for (const inv of invoicesMonth) {
      const cid = inv.client_id ? String(inv.client_id) : "";
      if (!cid) continue;
      if (!inv.invoice_date) continue;
      const d = String(inv.invoice_date);
      const prev = lastByClient.get(cid);
      if (!prev || d > prev) lastByClient.set(cid, d);
    }

    const sleeping_clients: SummaryResponse["sleeping_clients"] = clientIds
      .map((cid: string) => {
        const c = clientById.get(cid);
        const last = lastByClient.get(cid) ?? null;

        const days_since_last = last ? daysBetweenUTC(last, nowISO) : 999;
        const severity = severityFromDays(days_since_last);

        return {
          client: {
            id: cid,
            name: (c as any)?.name ?? null,
            contact_email: (c as any)?.contact_email ?? null,
          },
          days_since_last,
          severity,
        };
      })
      .filter((x: { days_since_last: number }) => x.days_since_last >= 31)
      .sort((a: any, b: any) => b.days_since_last - a.days_since_last)
      .slice(0, 12);

    const out: SummaryResponse = {
      ok: true,
      month,
      mode,
      actor: {
        id: String(actor.id),
        role: String(actor.role ?? ""),
        name: (actor as any)?.name ?? (actor as any)?.email ?? null,
        email: (actor as any)?.email ?? null,
      },
      delegate: {
        id: String(delegateInfo?.id ?? delegateId),
        name: delegateInfo?.name ?? null,
        email: delegateInfo?.email ?? null,
      },
      totals: {
        invoices_paid,
        invoices_unpaid,

        units_sale_paid,
        units_sale_unpaid,

        units_promotion_paid,
        units_promotion_unpaid,

        total_net_paid: Math.round(total_net_paid * 100) / 100,
        total_net_unpaid: Math.round(total_net_unpaid * 100) / 100,

        last_invoice_paid_at,
      },
      top_clients,
      recommender_tree,
      sleeping_clients,
    };

    return json(200, out);
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
