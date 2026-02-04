// src/lib/auth/current-actor.ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CurrentActor = {
  id: string;
  role: string | null;
  status: string | null;
  commission_level: number | null;
};

export async function requireCurrentActor(): Promise<CurrentActor> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) throw new Error("NO_USER");

  const { data: actor, error } = await supabase
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
