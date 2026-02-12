// src/app/dashboard/page.tsx
import "server-only";
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";

export const runtime = "nodejs";

// 🔒 Alias canònic: /dashboard NO decideix res.
// Tothom (si està logat) va a la mateixa pantalla base.
// La visibilitat ja la governen permisos / RLS / assignments dins del Control Room.
const CANONICAL_ENTRY = "/control-room/dashboard";

export default async function DashboardPage() {
  try {
    await requireCurrentActor();
    redirect(CANONICAL_ENTRY);
  } catch {
    redirect("/login?error=no_actor");
  }
}
