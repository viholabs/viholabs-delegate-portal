// src/app/dashboard/page.tsx
import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireCurrentActor } from "@/lib/auth/current-actor";
import { entryForActor } from "@/lib/auth/roles";
import {
  MODE_COOKIE,
  normalizeMode,
  pathForMode,
  roleAllowsMode,
} from "@/lib/auth/mode";

import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createAdminClient(url, key, { auth: { persistSession: false } });
}

async function hasMelquisedecMarker(actorId: string): Promise<boolean> {
  // Marker centralitzat a DB: effective_permissions(actor_id) retorna "__MELQUISEDEC__"
  // Ho consultem amb SERVICE ROLE per evitar comportaments no deterministes per RLS.
  const admin = getAdminSupabase();

  const { data, error } = await admin.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  // Si hi ha error, no bloquegem el sistema: simplement no apliquem bypass.
  if (error || !Array.isArray(data)) return false;

  return data.some((r: any) => r?.perm_code === "__MELQUISEDEC__");
}

export default async function DashboardPage() {
  try {
    const actor = await requireCurrentActor();

    // 0) MELQUISEDEC (sobirania fundacional) — per marker, no per rol, no per mode.
    if (await hasMelquisedecMarker(actor.id)) {
      redirect("/control-room/dashboard");
    }

    // 1) Entrada canónica por rol (prioritaria)
    const canonicalPath = entryForActor({
      role: actor.role,
      commission_level: actor.commission_level,
    });

    // Roles con dashboard exclusivo (ignoran mode)
    if (
      actor.role === "COORDINATOR_COMMERCIAL" ||
      actor.role === "KOL" ||
      actor.role === "CLIENT"
    ) {
      redirect(canonicalPath);
    }

    // 2) Mode (solo si el rol lo permite)
    const jar = await cookies();
    const modeRaw = jar.get(MODE_COOKIE)?.value ?? null;
    const mode = normalizeMode(modeRaw);

    if (mode && roleAllowsMode(actor.role, mode)) {
      redirect(pathForMode(mode));
    }

    // 3) Fallback canónico
    redirect(canonicalPath);
  } catch {
    redirect("/login?error=no_actor");
  }
}
