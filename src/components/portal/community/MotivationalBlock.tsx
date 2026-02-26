"use client";

/**
 * MotivationalBlock — Router per rol (profile_type) — CANÒNIC
 * IMPORTANT: només usem profile_type. Sense heurística.
 */

import { useMemo } from "react";
import { useCommunityProfile } from "./useCommunityProfile";

import MotivationalDelegate from "./MotivationalDelegate";
import MotivationalClient from "./MotivationalClient";
import MotivationalAdmin from "./MotivationalAdmin";
import MotivationalSuperAdmin from "./MotivationalSuperAdmin";
import MotivationalUnknown from "./MotivationalUnknown";

function norm(x: unknown): string {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export default function MotivationalBlock() {
  const { loading, profile } = useCommunityProfile();
  const role = useMemo(() => norm(profile?.profile_type), [profile]);

  if (loading) return null;

  // SUPER ADMIN (Fernando / Melquisedec)
  if (role === "super_admin" || role === "superadmin") return <MotivationalSuperAdmin />;

  // Delegats
  if (role === "delegate" || role === "delegat") return <MotivationalDelegate />;

  // Clients
  if (role === "client") return <MotivationalClient />;

  // Admin (altres)
  if (role === "admin") return <MotivationalAdmin />;

  return <MotivationalUnknown />;
}
