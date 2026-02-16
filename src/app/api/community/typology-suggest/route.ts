// src/app/api/community/typology-suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const url = new URL(req.url);
    const qRaw = (url.searchParams.get("q") ?? "").trim();
    const q = qRaw.replace(/\s+/g, " ");

    // Sense query -> suggeriments buits (o podries retornar top 10)
    if (!q) return json(200, { ok: true, suggestions: [] });

    // IMPORTANT:
    // v_typology_suggestions: columna "typology"
    const { data, error } = await supabase
      .from("v_typology_suggestions")
      .select("typology")
      .ilike("typology", `${q}%`)
      .limit(8);

    if (error) return json(500, { ok: false, error: error.message });

    const suggestions = (data ?? [])
      .map((r: any) => String(r.typology ?? "").trim())
      .filter(Boolean);

    return json(200, { ok: true, suggestions });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message || "Unknown error" });
  }
}
