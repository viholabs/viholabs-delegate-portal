import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login");

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm opacity-80">
        Sesión activa como: <b>{data.user.email}</b>
      </p>

      <form action="/logout" method="post" className="mt-6">
        <button className="rounded-md border px-4 py-2">Cerrar sesión</button>
      </form>
    </main>
  );
}
