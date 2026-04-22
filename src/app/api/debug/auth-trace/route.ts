import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result: Record<string, unknown> = {};

  // 1. What headers arrived?
  result.headers = {
    "x-viholabs-token": req.headers.get("x-viholabs-token") ?? null,
    authorization: req.headers.get("authorization") ?? null,
    cookie: req.headers.get("cookie") ?? null,
    xForwardedFor: req.headers.get("x-forwarded-for") ?? null,
  };

  // 2. Extract viholabs_auth_token from cookie header directly
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)viholabs_auth_token=([^;]+)/);
  const cookieToken = m?.[1] ? (() => { try { return decodeURIComponent(m[1]).trim(); } catch { return m[1].trim(); } })() : null;
  result.viholabs_auth_token_from_cookie = cookieToken ? cookieToken.substring(0, 40) + "..." : null;

  // 3. Which token would getBearerToken pick?
  const xViholabs = req.headers.get("x-viholabs-token")?.trim() ?? null;
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const authBearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
  const chosenToken = xViholabs ?? authBearerMatch ?? cookieToken;
  result.chosen_token = chosenToken ? chosenToken.substring(0, 40) + "..." : null;
  result.token_source = xViholabs ? "x-viholabs-token" : authBearerMatch ? "authorization" : cookieToken ? "viholabs_auth_token cookie" : "none";

  // 4. Try auth.getUser(token) with the chosen token
  if (chosenToken) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
      const supaRls = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${chosenToken}` } },
      });
      const { data, error } = await supaRls.auth.getUser(chosenToken);
      result.getUser_with_token = {
        userId: data?.user?.id ?? null,
        email: data?.user?.email ?? null,
        error: error?.message ?? null,
      };
    } catch (e) {
      result.getUser_with_token = { error: String(e) };
    }
  } else {
    result.getUser_with_token = "skipped — no token";
  }

  // 5. Try SSR cookies path
  try {
    const supaRls = await createServerSupabaseClient();
    const { data, error } = await supaRls.auth.getUser();
    result.getUser_ssr = {
      userId: data?.user?.id ?? null,
      email: data?.user?.email ?? null,
      error: error?.message ?? null,
    };
  } catch (e) {
    result.getUser_ssr = { error: String(e) };
  }

  return NextResponse.json(result, { status: 200 });
}
