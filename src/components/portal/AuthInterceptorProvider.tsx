"use client";

import { createClient } from "@/lib/supabase/client";

// ─── Constants ────────────────────────────────────────────────────────────────
const COOKIE_NAME = "viholabs_auth_token";

// ─── Helpers ──────────────────────────────────────────────────────────────────
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient();
  return _supabase;
}

/**
 * Write (or clear) the viholabs_auth_token cookie.
 *
 * JWT access tokens are Base64URL encoded — characters A-Za-z0-9, -, _, .
 * None of these need URL-encoding, so the raw cookie value is the raw JWT.
 * This bypasses every cookie parsing/encoding issue on the server side.
 */
function setAuthCookie(token: string | null) {
  if (token) {
    // max-age 3600 matches Supabase default access token lifetime.
    // Will be renewed by the onAuthStateChange listener on refresh.
    document.cookie = `${COOKIE_NAME}=${token}; path=/; samesite=lax; max-age=3600`;
  } else {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
  }
}

// ─── Module-level setup (runs before React, before any useEffect) ─────────────
// typeof window guard: Next.js still evaluates "use client" modules during SSR.
if (typeof window !== "undefined") {
  const supabase = getSupabase();

  // 1. Seed the cookie immediately from the cached session (synchronous path
  //    of getSession). Covers the common case where the session is in memory.
  supabase.auth.getSession().then(({ data: { session } }) => {
    setAuthCookie(session?.access_token ?? null);
  });

  // 2. Keep the cookie in sync whenever Supabase refreshes the token.
  supabase.auth.onAuthStateChange((_event, session) => {
    setAuthCookie(session?.access_token ?? null);
  });

  // 3. Patch window.fetch to inject Authorization header (works if nginx passes it).
  //    The cookie above is the fallback for proxies that strip Authorization.
  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function viholabsFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
        ? input.href
        : String(input);

    const isApiCall =
      url.startsWith("/api/") ||
      url.startsWith(`${window.location.origin}/api/`);

    if (isApiCall) {
      const headers = new Headers(init.headers ?? {});

      if (!headers.has("Authorization")) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            headers.set("Authorization", `Bearer ${session.access_token}`);
            // Also refresh the cookie in case it was stale.
            setAuthCookie(session.access_token);
          }
        } catch { /* proceed without token */ }
      }

      return _originalFetch(input, { ...init, headers });
    }

    return _originalFetch(input, init);
  };
}

// ─── Component (import trigger only) ─────────────────────────────────────────
export default function AuthInterceptorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
