import { createClient } from "@supabase/supabase-js";

/**
 * Provisionament canònic d'usuaris del portal (MVP)
 * - Auth user (si no existeix)
 * - Actor (si no existeix)
 *
 * En fase 2: externalitzar USERS (CSV/API).
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Falten variables d'entorn: SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const USERS = [
  { email: "fernando@viholabs.com", name: "Fernando Rueda Parra", role: "SUPER_ADMIN" },
  { email: "judithfibla@gmail.com", name: "Judith Fibla", role: "delegate" },
];

async function listUsersPage(page) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data?.users ?? [];
}

async function findAuthUserByEmail(email) {
  const target = String(email).toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const users = await listUsersPage(page);
    const found = users.find((u) => String(u.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (users.length < 200) break;
  }
  return null;
}

async function ensureAuthUser(email, name) {
  const existing = await findAuthUserByEmail(email);
  if (existing?.id) {
    console.log(`ℹ️ Auth user existent: ${email}`);
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) throw new Error(`createUser failed: ${error.message}`);
  if (!data?.user?.id) throw new Error("createUser: no user id returned");

  console.log(`✅ Creat Auth user: ${email}`);
  return data.user;
}

async function ensureActor(authUserId, email, name, role) {
  const { data: existing, error: selErr } = await supabase
    .from("actors")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (selErr) throw new Error(`actors select failed: ${selErr.message}`);

  if (existing?.id) {
    console.log(`ℹ️ Actor existent: ${email}`);
    return existing.id;
  }

  const { data, error: insErr } = await supabase
    .from("actors")
    .insert({
      auth_user_id: authUserId,
      email,
      name,
      role,
      status: "active",
    })
    .select("id")
    .single();

  if (insErr) throw new Error(`actors insert failed: ${insErr.message}`);
  if (!data?.id) throw new Error("actors insert: no id returned");

  console.log(`✅ Creat actor (${role}): ${email}`);
  return data.id;
}

async function main() {
  console.log("🚀 Provisionant usuaris del portal...\n");

  for (const u of USERS) {
    try {
      const authUser = await ensureAuthUser(u.email, u.name);
      await ensureActor(authUser.id, u.email, u.name, u.role);
    } catch (e) {
      console.error(`❌ Error ${u.email}:`, e?.message ?? e);
    }
  }

  console.log("\n🎯 Procés finalitzat.");
}

main().catch((e) => {
  console.error("💥 Error fatal:", e?.message ?? e);
  process.exit(1);
});
