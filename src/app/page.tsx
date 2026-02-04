// src/app/page.tsx
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";
import { entryForActor } from "@/lib/auth/roles";

export default async function RootPage() {
  try {
    const actor = await requireCurrentActor();
    redirect(entryForActor({ role: actor.role, commission_level: actor.commission_level }));
  } catch {
    redirect("/login?error=no_actor");
  }
}
