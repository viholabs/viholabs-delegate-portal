import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function requireAdminProfile() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignorado a propósito
          }
        },
      },
    }
  );

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) throw new Error("UNAUTHENTICATED");

  const userId = authData.user.id;

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("profile_type")
    .eq("user_id", userId)
    .single();

  if (profErr || !profile) throw new Error("NO_PROFILE");
  if (profile.profile_type !== "admin") throw new Error("FORBIDDEN");

  return { userId };
}
