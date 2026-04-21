"use client";

import { createClient } from "@/lib/supabase/client";

// ─── Module-level patch ────────────────────────────────────────────────────
// This runs when the browser evaluates the JS bundle — BEFORE React
// renders, hydrates, or runs any useEffect. That guarantees the interceptor
// is in place before the very first API call from any child component.
//
// Guard: typeof window check prevents this from running during SSR
// (Next.js "use client" modules still execute on the server for HTML
// generation, but window is undefined there).

if (typeof window !== "undefined") {
  // Singleton Supabase browser client — reuses the same instance
  // used by fetchWithAuth and MotivationalDelegate, so no double init.
  let _supabase: ReturnType<typeof createClient> | null = null;
  function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
  }

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
          } = await getSupabase().auth.getSession();

          if (session?.access_token) {
            headers.set("Authorization", `Bearer ${session.access_token}`);
          }
        } catch {
          // Cannot get session — proceed without token; server returns 401.
        }
      }

      return _originalFetch(input, { ...init, headers });
    }

    return _originalFetch(input, init);
  };
}
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mount this once at the root layout. The actual interceptor work happens
 * above at module-load time; this component is just the import trigger.
 */
export default function AuthInterceptorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
