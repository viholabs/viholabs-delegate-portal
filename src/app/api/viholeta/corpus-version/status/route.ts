// src/app/api/viholeta/corpus-version/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isSuperAdmin(roleRaw: any) {
  return (
    String(roleRaw ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_") === "SUPER_ADMIN"
  );
}

export async function GET(req: NextRequest) {
  try {
    const actorRes = await getActorFromRequest(req);
    if (!actorRes?.ok) return json(401, { ok: false, error: "unauthorized" });

    const actor = actorRes.actor;
    if (!isSuperAdmin(actor?.role)) {
      return json(403, { ok: false, error: "forbidden", detail: "SUPER_ADMIN only" });
    }

    const supabase = await createClient();

    const { data: rows, error } = await supabase
      .from("viholeta_corpus_versions")
      .select("code,label,is_active,created_at")
      .order("created_at", { ascending: true });

    if (error) return json(500, { ok: false, error: "server_error", detail: error.message });

    const active = (rows ?? []).find((r: any) => r.is_active)?.code ?? null;

    return json(200, { ok: true, active_version: active, versions: rows ?? [] });
  } catch (err: any) {
    return json(500, { ok: false, error: "server_error", detail: err?.message ?? "unknown" });
  }
}
