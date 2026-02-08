// src/app/(client)/client/layout.tsx
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";

export const runtime = "nodejs";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireCurrentActor();

  const allowed =
    actor.role === "CLIENT" ||
    actor.role === "SUPER_ADMIN";

  if (!allowed) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <section style={{ padding: "24px" }}>
      {children}
    </section>
  );
}
