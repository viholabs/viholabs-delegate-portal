import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  // Sin sesión → login
  if (!data?.user) {
    redirect("/login");
  }

  // 🔥 Decisión de rol CENTRAL
  const email = (data.user.email ?? "").toLowerCase();

  // Super Admin
  if (email === "vila@viholabs.com") {
    redirect("/control-room/dashboard");
  }

  // Delegate / resto
  redirect("/delegate/dashboard");
}
