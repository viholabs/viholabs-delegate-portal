import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) redirect("/login");

  const email = (data.user.email ?? "").toLowerCase();

  if (email === "vila@viholabs.com") {
    redirect("/control-room/dashboard");
  }

  redirect("/delegate/dashboard");
}
