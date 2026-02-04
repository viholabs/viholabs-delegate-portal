// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";
import { entryForActor } from "@/lib/auth/roles";

export default async function DashboardPage() {
  try {
    const actor = await requireCurrentActor();
    redirect(entryForActor({ role: actor.role, commission_level: actor.commission_level }));
  } catch {
    redirect("/login?error=no_actor");
  }
}
