// src/app/api/commission-agent/summary/route.ts
// Dashboard del agente de comisiones.
// No existe tabla 'delegates' — los delegados son actors.id con role COMMISSION_AGENT/DISTRIBUTOR.
// Afiliados: actor → actor_affiliate_links → affiliate_accounts → affiliate_attribution_events

import { getActorFromRequest, json } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const role = String(r.actor.role ?? "").toUpperCase();
  const supervisorRoles = ["SUPER_ADMIN", "MELQUISEDEC", "ADMINISTRATIVE"];
  const agentRoles = ["COMMISSION_AGENT", "DISTRIBUTOR"];
  const allowedRoles = [...agentRoles, ...supervisorRoles];

  if (!allowedRoles.includes(role)) {
    return json(403, { ok: false, error: "Acceso restringido a agentes de comisión" });
  }

  const url = new URL(req.url);
  const actorIdQ = url.searchParams.get("actorId") ?? String(r.actor.id);
  const isSupervisor = supervisorRoles.includes(role);
  const targetActorId = isSupervisor ? actorIdQ : String(r.actor.id);

  try {
    // 1. Actor info
    const { data: actor } = await r.supaService
      .from("actors")
      .select("id, name, email, role, status")
      .eq("id", targetActorId)
      .maybeSingle();

    // 2. Affiliate links: actor → affiliate_account_id
    const { data: affiliateLinks } = await r.supaService
      .from("actor_affiliate_links")
      .select("id, affiliate_account_id, state_code, created_at")
      .eq("actor_id", targetActorId);

    const affiliateAccountIds = (affiliateLinks ?? [])
      .map((l: any) => String(l.affiliate_account_id))
      .filter(Boolean);

    // 3. Affiliate account details
    let affiliateAccounts: any[] = [];
    if (affiliateAccountIds.length > 0) {
      const { data: accs } = await r.supaService
        .from("affiliate_accounts")
        .select("id, affiliate_external_id, name, email, status")
        .in("id", affiliateAccountIds);
      affiliateAccounts = accs ?? [];
    }

    // 4. Attribution events for these accounts
    let attributedClientIds: string[] = [];
    let totalConversions = 0;
    let recentEvents: any[] = [];

    if (affiliateAccountIds.length > 0) {
      const { data: events } = await r.supaService
        .from("affiliate_attribution_events")
        .select("id, affiliate_account_id, client_id, source, event_at, created_at")
        .in("affiliate_account_id", affiliateAccountIds)
        .order("created_at", { ascending: false })
        .limit(100);

      const eventsData = events ?? [];
      totalConversions = eventsData.length;
      recentEvents = eventsData.slice(0, 10);
      attributedClientIds = [
        ...new Set(eventsData.map((e: any) => e.client_id).filter(Boolean) as string[]),
      ];
    }

    // 5. Client details
    let attributedClients: any[] = [];
    if (attributedClientIds.length > 0) {
      const { data: clients } = await r.supaService
        .from("clients")
        .select("id, name, email, status")
        .in("id", attributedClientIds);
      attributedClients = clients ?? [];
    }

    // 6. Commissions for this actor (commissions.actor_id = actor's UUID)
    const { data: commissionRows } = await r.supaService
      .from("commissions")
      .select("id, source_month, amount, status, created_at")
      .eq("actor_id", targetActorId)
      .order("source_month", { ascending: false })
      .limit(12);

    const commissions = (commissionRows ?? []).map((c: any) => ({
      id: c.id,
      month: c.source_month ?? null,
      amount: c.amount ?? null,
      status: c.status ?? null,
    }));

    // 7. Invoice summary: invoices where actor attribution exists
    const { data: invoiceRows } = await r.supaService
      .from("invoice_actor_assignments")
      .select("invoice_id")
      .eq("actor_id", targetActorId)
      .limit(500);

    const invoiceIds = (invoiceRows ?? []).map((i: any) => i.invoice_id).filter(Boolean);
    let invoiceSummary = { count: 0, total_net: 0 };

    if (invoiceIds.length > 0) {
      const { data: invs } = await r.supaService
        .from("invoices")
        .select("id, total_net, status")
        .in("id", invoiceIds)
        .in("status", ["paid", "accounted"]);

      const invData = invs ?? [];
      invoiceSummary = {
        count: invData.length,
        total_net: invData.reduce((s: number, i: any) => s + (Number(i.total_net) || 0), 0),
      };
    }

    return json(200, {
      ok: true,
      actor: actor ?? { id: targetActorId, name: null, email: null, role, status: null },
      affiliate_accounts: affiliateAccounts,
      attributed_clients: attributedClients,
      stats: {
        total_conversions: totalConversions,
        attributed_clients_count: attributedClients.length,
        affiliate_accounts_count: affiliateAccounts.length,
      },
      recent_events: recentEvents,
      commissions,
      invoice_summary: invoiceSummary,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}
