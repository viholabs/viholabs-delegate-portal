import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const supa = ctx.supaService;

  // Load all affiliates with email
  const { data: affiliates, error: affErr } = await supa
    .from("affiliate_accounts")
    .select("id, email")
    .not("email", "is", null);

  if (affErr) return json(500, { ok: false, error: affErr.message });

  const emails = (affiliates ?? []).map((a: any) => a.email?.toLowerCase()).filter(Boolean);
  if (emails.length === 0) return json(200, { ok: true, matched: 0, already_linked: 0 });

  // Find clients matching those emails
  const { data: clients } = await supa
    .from("clients")
    .select("id, contact_email")
    .in("contact_email", emails);

  const clientByEmail = new Map(((clients ?? []) as any[]).map((c) => [c.contact_email?.toLowerCase(), c]));

  let matched = 0;
  let already_linked = 0;

  for (const aff of (affiliates ?? []) as any[]) {
    const email = aff.email?.toLowerCase();
    if (!email) continue;

    const client = clientByEmail.get(email);
    if (!client) continue;

    // Check if already linked
    const { data: existing } = await supa
      .from("affiliate_attribution_events")
      .select("id")
      .eq("affiliate_account_id", aff.id)
      .eq("client_id", client.id)
      .limit(1);

    if (existing?.length) {
      already_linked++;
      continue;
    }

    const eventHash = crypto.createHash("md5").update(`email_match_${aff.id}_${client.id}`).digest("hex");

    const { error } = await supa.from("affiliate_attribution_events").insert({
      affiliate_account_id: aff.id,
      client_id: client.id,
      customer_email: email,
      source: "email_match",
      source_event_id: "AUTO_EMAIL_MATCH",
      event_hash: eventHash,
      event_at: new Date().toISOString(),
      state_code: "OPEN",
    });

    if (!error) matched++;
  }

  return json(200, { ok: true, matched, already_linked });
}
