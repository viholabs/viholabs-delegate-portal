import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function normalizeEmail(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : null;
  return s && s.includes("@") ? s : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const eventHash = md5(rawBody);

  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Extract affiliate fields — BixGrow may send affiliate as a nested object or flat fields
  const affiliateObj = (payload.affiliate as Record<string, unknown>) ?? {};

  const bixgrowAffiliateId =
    asString(payload.affiliate_id) ??
    asString(payload.affiliateId) ??
    asString(affiliateObj.id) ??
    null;

  const affiliateNameFallback =
    [asString(affiliateObj.first_name ?? payload.affiliate_first_name), asString(affiliateObj.last_name ?? payload.affiliate_last_name)]
      .filter(Boolean)
      .join(" ") || null;

  const affiliateName =
    asString(affiliateObj.name) ??
    asString(payload.affiliate_name) ??
    affiliateNameFallback;

  const affiliateEmail =
    normalizeEmail(affiliateObj.email) ??
    normalizeEmail(payload.affiliate_email) ??
    null;

  const referralCode =
    asString(affiliateObj.referral_code ?? affiliateObj.referralCode ?? affiliateObj.code) ??
    asString(payload.referral_code ?? payload.referralCode) ??
    null;

  const commissionType =
    asString(affiliateObj.commission_type ?? affiliateObj.commissionType) ??
    asString(payload.commission_type ?? payload.commissionType) ??
    null;

  const commissionValue =
    asNumber(affiliateObj.commission_value ?? affiliateObj.commissionValue) ??
    asNumber(payload.commission_value ?? payload.commissionValue) ??
    null;

  const customerEmail =
    normalizeEmail(payload.customer_email) ??
    normalizeEmail(payload.customerEmail) ??
    normalizeEmail((payload.customer as any)?.email) ??
    null;

  const commissionAmount =
    asNumber(payload.commission) ??
    asNumber(payload.commission_amount) ??
    asNumber(payload.commissionAmount) ??
    null;

  const orderAmount =
    asNumber(payload.sub_total) ??
    asNumber(payload.subTotal) ??
    asNumber(payload.amount) ??
    asNumber(payload.total) ??
    null;

  // Upsert affiliate_account from webhook data (BixGrow has no pull API)
  let affiliateAccountId: string | null = null;
  if (bixgrowAffiliateId) {
    const upsertRow: Record<string, unknown> = {
      affiliate_external_id: bixgrowAffiliateId,
      source: "bixgrow",
      synced_at: new Date().toISOString(),
    };
    if (affiliateName) upsertRow.name = affiliateName;
    if (affiliateEmail) upsertRow.email = affiliateEmail;
    if (referralCode) upsertRow.referral_code = referralCode;
    if (commissionType) upsertRow.commission_type = commissionType;
    if (commissionValue != null) upsertRow.commission_value = commissionValue;

    const { data: existing } = await supa
      .from("affiliate_accounts")
      .select("id")
      .eq("affiliate_external_id", bixgrowAffiliateId)
      .maybeSingle();

    if (existing) {
      affiliateAccountId = existing.id;
      await supa
        .from("affiliate_accounts")
        .update(upsertRow)
        .eq("id", existing.id);
    } else {
      // New affiliate — name is required
      if (!upsertRow.name) upsertRow.name = affiliateEmail ?? bixgrowAffiliateId;
      upsertRow.state_code = "OPEN";
      const { data: ins } = await supa
        .from("affiliate_accounts")
        .insert(upsertRow)
        .select("id")
        .single();
      affiliateAccountId = ins?.id ?? null;
    }
  }

  // Resolve client_id from customer email
  let clientId: string | null = null;
  if (customerEmail) {
    const { data } = await supa
      .from("clients")
      .select("id")
      .eq("contact_email", customerEmail)
      .maybeSingle();
    clientId = data?.id ?? null;
  }

  const eventRow = {
    source: "bixgrow" as const,
    source_event_id: asString(payload.type) ?? asString(payload.event_type) ?? "WEBHOOK_UNKNOWN",
    source_payload: payload,
    event_hash: eventHash,
    event_at: new Date().toISOString(),
    bixgrow_affiliate_id: bixgrowAffiliateId,
    customer_email: customerEmail,
    affiliate_account_id: affiliateAccountId,
    client_id: clientId,
    commission_amount: commissionAmount,
    order_amount: orderAmount,
    state_code: "OPEN",
  };

  const { error } = await supa.from("affiliate_attribution_events").insert(eventRow);

  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return NextResponse.json({ ok: true, action: "noop" });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    action: "inserted",
    resolved: {
      affiliate_account_id: affiliateAccountId,
      client_id: clientId,
    },
  });
}
