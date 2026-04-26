import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";
import {
  holdedCreateContact,
  holdedFindContactByEmail,
} from "@/lib/holded/holdedClient";

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
    .select("id, name, email")
    .not("email", "is", null)
    .order("name");

  if (affErr) return json(500, { ok: false, error: affErr.message });

  let provisioned = 0;
  let linked = 0;
  let alreadyLinked = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const aff of (affiliates ?? []) as { id: string; name: string | null; email: string | null }[]) {
    const email = (aff.email ?? "").toLowerCase().trim();
    if (!email) continue;

    // Check if already linked
    const { data: existing } = await supa
      .from("affiliate_attribution_events")
      .select("id")
      .eq("affiliate_account_id", aff.id)
      .not("client_id", "is", null)
      .limit(1);

    if (existing?.length) {
      alreadyLinked++;
      continue;
    }

    // Check if a client with this email already exists
    const { data: existingClient } = await supa
      .from("clients")
      .select("id, name")
      .eq("contact_email", email)
      .maybeSingle();

    if (existingClient) {
      const eventHash = crypto.createHash("md5").update(`link_${aff.id}_${existingClient.id}`).digest("hex");
      await supa.from("affiliate_attribution_events").insert({
        affiliate_account_id: aff.id,
        client_id: existingClient.id,
        customer_email: email,
        source: "email_match",
        source_event_id: "AUTO_EMAIL_MATCH",
        event_hash: eventHash,
        event_at: new Date().toISOString(),
        state_code: "OPEN",
      });
      linked++;
      continue;
    }

    // Create Holded contact + Viholabs client
    try {
      let holdedContactId: string | null = null;

      const found = await holdedFindContactByEmail(email);
      if (found) {
        holdedContactId = found.id;
      } else {
        const newContact = await holdedCreateContact({
          name: aff.name ?? email,
          email,
          type: 0,
          isperson: 1,
        });
        holdedContactId = newContact.id;
      }

      const { data: newClient, error: clientErr } = await supa
        .from("clients")
        .insert({
          name: aff.name ?? email,
          contact_email: email,
          holded_contact_id: holdedContactId,
          status: "ACTIVE",
          state_code: "OPEN",
          source: "bixgrow_affiliate",
        })
        .select("id")
        .single();

      if (clientErr) {
        errors++;
        errorDetails.push(`${aff.name}: ${clientErr.message}`);
        continue;
      }

      const eventHash = crypto.createHash("md5").update(`provision_${aff.id}_${newClient.id}`).digest("hex");
      await supa.from("affiliate_attribution_events").insert({
        affiliate_account_id: aff.id,
        client_id: newClient.id,
        customer_email: email,
        source: "bixgrow_provision",
        source_event_id: "AUTO_PROVISION",
        event_hash: eventHash,
        event_at: new Date().toISOString(),
        state_code: "OPEN",
      });

      provisioned++;
    } catch (e: unknown) {
      errors++;
      errorDetails.push(`${aff.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json(200, {
    ok: true,
    total_affiliates: (affiliates ?? []).length,
    already_linked: alreadyLinked,
    linked,
    provisioned,
    errors,
    error_details: errorDetails.length > 0 ? errorDetails : undefined,
  });
}
