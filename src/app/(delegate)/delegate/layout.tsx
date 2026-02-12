// src/app/(delegate)/delegate/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";

import DelegateShell from "@/components/Delegate/DelegateShell";

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
    redirect("/dashboard?error=forbidden");
  }

  return <DelegateShell>{children}</DelegateShell>;
}
