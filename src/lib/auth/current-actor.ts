// src/lib/auth/current-actor.ts
import "server-only";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export type CurrentActor = {
  id: string;
  role: string | null;
  status: string | null;
  commission_level: number | null;
};

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

/**
 * ✅ CANÓNICO (producción robusta):
 * - La sesión (getUser) se resuelve con cookies SSR (RLS client).
 * - El lookup del actor se resuelve con SERVICE ROLE (NO RLS),
 *   igual que /auth/callback. Esto evita comportamientos no deterministas
 *   por policies, actor_users incompletos, etc.
 */
export async function requireCurrentActor(): Promise<CurrentActor> {
  const supabase = await createSsrClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) throw new Error("NO_USER");

  const admin = getAdminSupabase();
  const { data: actor, error } = await admin
    .from("actors")
    .select("id, role, status, commission_level")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (error || !actor) throw new Error("NO_ACTOR");
  if (actor.status !== "active") throw new Error("ACTOR_INACTIVE");

  return {
    id: String(actor.id),
    role: actor.role ?? null,
    status: actor.status ?? null,
    commission_level: actor.commission_level ?? null,
  };
}
