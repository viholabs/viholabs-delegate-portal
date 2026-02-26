"use client";

import { useEffect, useState } from "react";

export type CommunityProfile = {
  profile_type: string | null;
  department: string | null;
  job_title: string | null;
};

async function safeReadJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
}

/**
 * Best-effort: if session is stored client-side (localStorage), obtain access_token and send Bearer.
 * If not available, we still call the endpoint without headers (cookie SSR path).
 */
async function tryGetAccessToken(): Promise<string> {
  try {
    const env = getSupabasePublicEnv();
    if (!env) return "";

    const mod = await import("@supabase/supabase-js");
    const supabase = mod.createClient(env.url, env.anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  } catch {
    return "";
  }
}

export function useCommunityProfile() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CommunityProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const token = await tryGetAccessToken();

        const res = await fetch("/api/community/profile", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          // Canon: avoid browser caching stale identity
          cache: "no-store",
        });

        const data = await safeReadJson(res);
        if (!res.ok || !data?.ok) throw new Error("profile_load_failed");

        const p = data.profile || {};
        const next: CommunityProfile = {
          profile_type: typeof p.profile_type === "string" ? p.profile_type : null,
          department: typeof p.department === "string" ? p.department : null,
          job_title: typeof p.job_title === "string" ? p.job_title : null,
        };

        if (!cancelled) setProfile(next);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, profile };
}
