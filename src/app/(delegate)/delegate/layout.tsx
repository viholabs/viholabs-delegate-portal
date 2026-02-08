// src/app/(delegate)/delegate/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";

export default async function DelegateLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireCurrentActor();

  const role = String(actor.role ?? "").toUpperCase();

  const allowed = [
    "DELEGATE",
    "SUPER_ADMIN",
    "ADMINISTRATIVE",
    "COORDINATOR_COMMERCIAL",
    "COORDINATOR_CECT",
  ];

  if (!allowed.includes(role)) {
    // 🔒 Corte duro: no es delegate ni supervisor
    redirect("/dashboard?error=forbidden");
  }

  return <>{children}</>;
}
