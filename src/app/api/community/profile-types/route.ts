// src/app/api/community/profile-types/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json(401, { ok: false, error: "unauthorized" });

  const q = await supabase
    .from("profile_types")
    .select("code,label,state_code")
    .eq("state_code", "ACTIVE")
    .order("label", { ascending: true });

  if (q.error) return json(500, { ok: false, error: q.error.message });

  return json(200, { ok: true, items: q.data || [] });
}
