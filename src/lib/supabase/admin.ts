// src/lib/supabase/admin.ts
/**
 * VIHOLABS — Supabase Admin Client (server-only)
 * Canon: used for infra tasks (service_role).
 */
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function supabaseAdmin() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
