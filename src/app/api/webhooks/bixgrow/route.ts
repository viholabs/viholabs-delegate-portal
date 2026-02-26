import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text(); // IMPORTANT: body exacte
  const eventHash = md5(rawBody);

  let payload: any = null;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("affiliate_attribution_events")
    .insert({
      source: "bixgrow",
      source_event_id: payload?.type ?? "WEBHOOK_UNKNOWN",
      source_payload: payload,
      event_hash: eventHash,
      event_at: new Date().toISOString(),
    });

  if (error) {
    // Duplicate = comportament NORMAL
    if (error.message.includes("duplicate") || error.code === "23505") {
      return NextResponse.json({ ok: true, action: "noop" });
    }

    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, action: "inserted" });
}