// src/lib/auth/permissions.ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

type RpcPermRow = { perm_code: string | null };

export type EffectivePermissions = {
  isSuperAdmin: boolean;
  perms: Set<string>;
  has: (perm: string) => boolean;
};

/**
 * Permisos efectivos (RBAC + overrides) desde la función SQL:
 * public.effective_permissions(actor_id)
 *
 * - Si devuelve '*', es SUPER_ADMIN => acceso total.
 * - Esto escala a miles de usuarios: pocos permisos por rol + pocos overrides por actor.
 */
export async function getEffectivePermissionsByActorId(
  actorId: string
): Promise<EffectivePermissions> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  if (error) {
    throw new Error(`effective_permissions failed: ${error.message}`);
  }

  const rows = (data ?? []) as RpcPermRow[];
  const codes: string[] = rows
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
