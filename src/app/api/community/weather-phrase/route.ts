// src/app/api/community/weather-phrase/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normLang(raw: string): "CAT" | "ES" | "EN" | "FR" {
  const v = String(raw || "").trim().toLowerCase();
  if (v.startsWith("ca")) return "CAT";
  if (v.startsWith("es")) return "ES";
  if (v.startsWith("fr")) return "FR";
  return "EN";
}

function pickPortalLang(req: NextRequest): "CAT" | "ES" | "EN" | "FR" {
  // 1) header explícit si algun dia el portal el posa
  const hx = req.headers.get("x-viho-lang");
  if (hx) return normLang(hx);

  // 2) cookie (si existeix)
  const c = req.cookies.get("viho_lang")?.value;
  if (c) return normLang(c);

  // 3) Accept-Language del navegador
  const al = req.headers.get("accept-language") || "";
  return normLang(al);
}

export async function GET(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, {
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const url = new URL(req.url);
    const category = String(url.searchParams.get("category") || "").trim();
    const exclude = String(url.searchParams.get("exclude") || "").trim();

    if (!category) return json(400, { ok: false, error: "category_required" });

    const lang = pickPortalLang(req);

    const supabase = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Primer intent: frase random que NO sigui l’exclosa (si n’hi ha)
    let q = supabase
      .from("community_weather_phrases")
      .select("phrase")
      .eq("is_active", true)
      .eq("lang_code", lang)
      .eq("category", category)
      .limit(50);

    const { data, error } = await q;
    if (error) return json(500, { ok: false, error: error.message });

    const phrases = (data || [])
      .map((r: any) => String(r?.phrase || "").trim())
      .filter(Boolean);

    if (phrases.length === 0) {
      return json(200, { ok: false, error: "no_phrases", lang, category });
    }

    const filtered = exclude ? phrases.filter((p) => p !== exclude) : phrases;
    const pool = filtered.length > 0 ? filtered : phrases;

    const phrase = pool[Math.floor(Math.random() * pool.length)];

    return json(200, { ok: true, lang, category, phrase });
  } catch (e) {
    return json(500, { ok: false, error: e instanceof Error ? e.message : "server_error" });
  }
}
