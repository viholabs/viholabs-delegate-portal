"use client";

import { useEffect, useState } from "react";

export type CommunityProfile = {
  id: string | null;
  user_id: string | null;
  actor_id: string | null;
  actorId: string | null;
  effective_actor_id: string | null;
  profile_id: string | null;
  role: string | null;
  profile_type: string | null;
  is_melquisedec: boolean;
};

type CommunityProfileResponse =
  | {
      ok: true;
      profile: CommunityProfile;
    }
  | {
      ok: false;
      error: string;
    };

const EMPTY_PROFILE: CommunityProfile = {
  id: null,
  user_id: null,
  actor_id: null,
  actorId: null,
  effective_actor_id: null,
  profile_id: null,
  role: null,
  profile_type: null,
  is_melquisedec: false,
};

export function useCommunityProfile() {
  const [profile, setProfile] = useState<CommunityProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/community/profile", {
          method: "GET",
          cache: "no-store",
        });

        const json = (await res.json().catch(() => null)) as
          | CommunityProfileResponse
          | null;

        if (!res.ok || !json || !json.ok) {
          throw new Error(
            !json || json.ok
              ? `HTTP ${res.status}`
              : json.error || "No se pudo cargar el perfil"
          );
        }

        if (!cancelled) {
          setProfile({
            ...EMPTY_PROFILE,
            ...json.profile,
            is_melquisedec: Boolean(json.profile.is_melquisedec),
          });
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setProfile(EMPTY_PROFILE);
          setError(e instanceof Error ? e.message : "Error desconocido");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    profile,
    loading,
    error,
    isMelquisedec: Boolean(profile.is_melquisedec),
  };
}

export default useCommunityProfile;