"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Patches window.fetch globally so every /api/* call from this browser
 * automatically carries Authorization: Bearer {token}.
 *
 * This is the single source of truth for API authentication. No individual
 * component needs to use fetchWithAuth — plain fetch() now works everywhere.
 *
 * Token is always fresh: getSession() is cached by the Supabase browser client
 * and resolves from memory; it only makes a network call when the token is
 * about to expire (handled transparently by autoRefreshToken: true).
 */
export default function AuthInterceptorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const supabase = createClient();
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function interceptedFetch(
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
            }
          } catch {
            // If we can't get the session, proceed without Bearer.
            // Server will fall back to cookie auth or return 401.
          }
        }

        return originalFetch(input, { ...init, headers });
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
}
