// src/app/(kol)/kol/layout.tsx
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";

export const runtime = "nodejs";

export default async function KolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireCurrentActor();

  const allowed =
    actor.role === "KOL" ||
    actor.role === "SUPER_ADMIN";

  if (!allowed) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <section style={{ padding: "24px" }}>
      {/* Header mínimo */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "rgba(89,49,60,0.7)",
          }}
        >
          Viholabs · KOL
        </div>
        <h1
          style={{
            marginTop: 4,
            fontSize: 22,
            fontWeight: 600,
            color: "#59313c",
          }}
        >
          Panel KOL
        </h1>
      </div>

      {children}
    </section>
  );
}
