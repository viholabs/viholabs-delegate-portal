// src/lib/auth/permissions.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

type RpcPermRow = { perm_code: string | null };

export type EffectivePermissions = {
  isSuperAdmin: boolean;
  perms: Set<string>;
  has: (perm: string) => boolean;
};

/**
 * Permisos efectius (RBAC + overrides) des de la funció SQL:
 * public.effective_permissions(actor_id)
 *
 * IMPORTANT:
 * - Aquesta RPC S'EXECUTA AMB SERVICE ROLE
 * - Mai amb el client de sessió (authenticated)
 * - Evita recursió RLS → stack depth exceeded
 */
export async function getEffectivePermissionsByActorId(
  actorId: string
): Promise<EffectivePermissions> {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  if (error) {
    throw new Error(`effective_permissions failed: ${error.message}`);
  }

  const rows = (data ?? []) as RpcPermRow[];

  const codes = rows
    .map((r) => String(r?.perm_code ?? "").trim())
    .filter((x) => x.length > 0);

  const isSuperAdmin = codes.includes("*");
  const perms = new Set<string>(codes);

  return {
    isSuperAdmin,
    perms,
    has: (perm: string) => (isSuperAdmin ? true : perms.has(perm)),
  };
}
