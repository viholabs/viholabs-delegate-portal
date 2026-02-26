"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RobotAvatarSvg from "./RobotAvatarSvg";

/* ---------------- TYPES ---------------- */

type Lang = "ca" | "es" | "en" | "fr";

type Profile = {
  viholabs_id?: string | null;
  joined_at?: string | null;
  aka: string | null;
  display_name: string | null;
  effective_name: string | null;
  company: string | null;
  profile_type: string | null;
  consent_image_policy: boolean;
  avatar_url: string | null;
  department: string | null;
  job_title: string | null;
};

/* ---------------- I18N ---------------- */

const I18N = {
  es: {
    g: { morning: "Buenos días", afternoon: "Buenas tardes", night: "Buenas noches" },
    placeholder_aka: "¿Cómo te llamamos?",
  },
} as const;

/* ---------------- HELPERS ---------------- */

function timeKey(): "morning" | "afternoon" | "night" {
  const h = new Date().getHours();
  if (h < 14) return "morning";
  if (h < 21) return "afternoon";
  return "night";
}

async function safeReadJson(res: Response): Promise<any> {
  const t = await res.text();
  try { return JSON.parse(t); } catch { return null; }
}

function firstNonEmpty(...xs: any[]): string {
  for (const x of xs) {
    const s = String(x ?? "").trim();
    if (s) return s;
  }
  return "";
}

/* ---------------- COMPONENT ---------------- */

export default function IdentityBlock() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [akaDraft, setAkaDraft] = useState("");

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/community/profile", {
          method: "GET",
          cache: "no-store",
        });

        const data = await safeReadJson(res);

        if (!res.ok || !data?.ok) {
          if (!cancelledRef.current) setProfile(null);
          return;
        }

        const p = data.profile || {};

        const next: Profile = {
          viholabs_id: p.viholabs_id ?? null,
          joined_at: p.joined_at ?? null,
          aka: p.aka ?? null,
          display_name: p.display_name ?? null,
          effective_name: p.effective_name ?? null,
          company: p.company ?? null,
          profile_type: p.profile_type ?? null,
          consent_image_policy: Boolean(p.consent_image_policy),
          avatar_url: p.avatar_url ?? null,
          department: p.department ?? null,
          job_title: p.job_title ?? null,
        };

        if (!cancelledRef.current) {
          setProfile(next);
          setAkaDraft(firstNonEmpty(next.aka, next.display_name, next.effective_name));
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function saveAka() {
    if (!profile) return;

    const finalVal = akaDraft.trim();
    if (!finalVal) return;

    try {
      await fetch("/api/community/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aka: finalVal }),
        cache: "no-store",
      });

      setProfile(prev => prev ? { ...prev, aka: finalVal } : prev);
    } catch {}
  }

  if (loading) return null;
  if (!profile) return null;

  const greeting = I18N.es.g[timeKey()];
  const officialName = firstNonEmpty(profile.display_name, profile.effective_name);
  const role = profile.profile_type;
  const company = profile.company;

  return (
    <div className="rounded-xl border p-5 bg-[var(--viho-surface)]">
      <div className="text-xs text-[var(--viho-muted)] mb-1">
        {greeting},
      </div>

      <div className="text-[22px] font-semibold tracking-tight text-[var(--viho-gold)]">
        <input
          value={akaDraft}
          onChange={(e) => setAkaDraft(e.target.value)}
          onBlur={() => void saveAka()}
          className="bg-transparent outline-none w-full"
          placeholder={I18N.es.placeholder_aka}
        />
      </div>

      {officialName && (
        <div className="text-sm text-[var(--viho-muted)] mt-1">
          {officialName}
        </div>
      )}

      {(role || company) && (
        <div className="text-xs text-[var(--viho-muted)] mt-2 opacity-70">
          {[role, company].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}
