import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Payload = {
  name: string;
  email: string;
};

function getBearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

function bad(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const INTERNAL = (process.env.VIHOLABS_INTERNAL_BEARER || "").trim();
  if (!INTERNAL) return bad(500, "Missing env: VIHOLABS_INTERNAL_BEARER");

  const token = getBearer(req);
  if (!token || token !== INTERNAL) return bad(401, "Unauthorized");

  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!SUPABASE_URL) return bad(500, "Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!SERVICE_ROLE) return bad(500, "Missing env: SUPABASE_SERVICE_ROLE_KEY");

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return bad(400, "Invalid JSON body");
  }

  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  if (!name) return bad(400, "Missing 'name'");
  if (!email || !email.includes("@")) return bad(400, "Missing/invalid 'email'");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Find auth user by email (canonical source of auth_user_id)
  const findAuth = await supabase
    .schema("auth")
    .from("users")
    .select("id,email,created_at")
    .eq("email", email)
    .limit(1);

  if (findAuth.error) {
    return bad(500, "Failed to query auth.users", { detail: findAuth.error.message });
  }

  let authUserId: string | null = findAuth.data?.[0]?.id ?? null;

  // 2) If not exists, create Auth user (invite)
  if (!authUserId) {
    const invited = await supabase.auth.admin.inviteUserByEmail(email);
    if (invited.error || !invited.data?.user?.id) {
      return bad(500, "Failed to invite/create auth user", {
        detail: invited.error?.message || "No user id returned",
      });
    }
    authUserId = invited.data.user.id;
  }

  // 3) Upsert actor by auth_user_id
  const existingActor = await supabase
    .from("actors")
    .select("id,auth_user_id,role,name,email,status,state_code")
    .eq("auth_user_id", authUserId)
    .limit(1);

  if (existingActor.error) {
    return bad(500, "Failed to query actors", { detail: existingActor.error.message });
  }

  let actorId: string;

  if (existingActor.data && existingActor.data.length > 0) {
    actorId = existingActor.data[0].id;

    // Keep it canonical: ensure role/name/email consistent
    const upd = await supabase
      .from("actors")
      .update({
        role: "delegate",
        name,
        email,
        status: "active",
        state_code: "OPEN",
        updated_at: new Date().toISOString(),
      })
      .eq("id", actorId);

    if (upd.error) return bad(500, "Failed to update actor", { detail: upd.error.message });
  } else {
    const ins = await supabase
      .from("actors")
      .insert({
        auth_user_id: authUserId,
        role: "delegate",
        name,
        email,
        status: "active",
        state_code: "OPEN",
      })
      .select("id")
      .single();

    if (ins.error || !ins.data?.id) {
      return bad(500, "Failed to insert actor", { detail: ins.error?.message || "No actor id returned" });
    }
    actorId = ins.data.id;
  }

  // 4) Ensure actor_users mapping exists
  const mapExists = await supabase
    .from("actor_users")
    .select("user_id,actor_id")
    .eq("user_id", authUserId)
    .limit(1);

  if (mapExists.error) return bad(500, "Failed to query actor_users", { detail: mapExists.error.message });

  if (!mapExists.data || mapExists.data.length === 0) {
    const mapIns = await supabase.from("actor_users").insert({
      user_id: authUserId,
      actor_id: actorId,
      state_code: "OPEN",
    });
    if (mapIns.error) return bad(500, "Failed to insert actor_users", { detail: mapIns.error.message });
  }

  // 5) Ensure delegates row exists (delegate_id)
  const delExists = await supabase
    .from("delegates")
    .select("id,actor_id,name,email,active,state_code")
    .eq("actor_id", actorId)
    .limit(1);

  if (delExists.error) return bad(500, "Failed to query delegates", { detail: delExists.error.message });

  let delegateId: string;

  if (delExists.data && delExists.data.length > 0) {
    delegateId = delExists.data[0].id;

    const updDel = await supabase
      .from("delegates")
      .update({
        name,
        email,
        active: true,
        state_code: "OPEN",
        updated_at: new Date().toISOString(),
      })
      .eq("id", delegateId);

    if (updDel.error) return bad(500, "Failed to update delegates", { detail: updDel.error.message });
  } else {
    const insDel = await supabase
      .from("delegates")
      .insert({
        actor_id: actorId,
        name,
        email,
        active: true,
        state_code: "OPEN",
      })
      .select("id")
      .single();

    if (insDel.error || !insDel.data?.id) {
      return bad(500, "Failed to insert delegates", { detail: insDel.error?.message || "No delegate id returned" });
    }
    delegateId = insDel.data.id;
  }

  return NextResponse.json({
    ok: true,
    input: { name, email },
    auth_user_id: authUserId,
    actor_id: actorId,
    delegate_id: delegateId,
  });
}
