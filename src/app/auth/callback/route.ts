import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(nextRaw: string | null) {
  // Por defecto: super admin
  const fallback = "/control-room/dashboard";

  if (!nextRaw) return fallback;
  if (!nextRaw.startsWith("/")) return fallback;
  if (nextRaw.startsWith("//")) return fallback;

  // Prohibimos / y /dashboard
  if (nextRaw === "/" || nextRaw === "/dashboard") return fallback;

  return nextRaw;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  if (!code) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "auth_failed");
    return NextResponse.redirect(loginUrl);
  }

  // 🔥 DECISIÓN FINAL AQUÍ (sin depender de /dashboard)
  const { data } = await supabase.auth.getUser();
  const email = (data?.user?.email ?? "").toLowerCase();

  const isSuperAdmin = email === "vila@viholabs.com";
  const destination = isSuperAdmin ? "/control-room/dashboard" : "/delegate/dashboard";

  // Si viene next válido y NO es /dashboard, lo respetamos (opcional)
  const next = safeNext(url.searchParams.get("next"));
  const finalUrl = next ? next : destination;

  // Si next apuntaba a zona genérica, manda al destino por rol
  const final =
    finalUrl === "/dashboard" || finalUrl === "/" ? destination : finalUrl;

  return NextResponse.redirect(new URL(final, url.origin));
}
