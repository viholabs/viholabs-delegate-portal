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

export function useCommunityProfile() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CommunityProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const res = await fetch("/api/community/profile", { method: "GET" });
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
