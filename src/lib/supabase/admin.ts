// src/lib/supabase/admin.ts
/**
 * VIHOLABS — Supabase Admin Client (server-only)
 * Canon: used for infra tasks (service_role).
 *
 * CI / runners must work with:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * NEXT_PUBLIC_SUPABASE_URL is allowed as a fallback for local/dev environments
 * where only public envs are present.
 */
import { createClient } from "@supabase/supabase-js";

function requireEnvAny(names: string[]): string {
  for (const name of names) {
    const v = process.env[name];
    if (v && String(v).trim()) return String(v).trim();
  }
  throw new Error(`Missing env: ${names.join(" or ")}`);
}

export function supabaseAdmin() {
  const url = requireEnvAny(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const service = requireEnvAny(["SUPABASE_SERVICE_ROLE_KEY"]);
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
