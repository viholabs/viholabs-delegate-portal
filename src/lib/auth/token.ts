"use client";

/**
 * Reads the Viholabs access token from the browser cookie.
 *
 * viholabs_auth_token is set with httpOnly:false by /auth/password so JS can
 * read it. It contains a valid Supabase JWT for up to 1 hour after login.
 * Falls back to supabase.auth.getSession() for environments where the cookie
 * is absent (e.g. local dev with active Supabase SSR session).
 */
export function getViholabsTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)viholabs_auth_token=([^;]+)/);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return m[1].trim() || null;
  }
}

import { createClient } from "@/lib/supabase/client";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient();
  return _supabase;
}

/**
 * Returns a valid access token for API calls.
 * Prefers viholabs_auth_token cookie (always fresh after login).
 * Falls back to Supabase getSession for backwards compatibility.
 */
export async function getAccessToken(): Promise<string | null> {
  const cookie = getViholabsTokenFromCookie();
  if (cookie) return cookie;

  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
