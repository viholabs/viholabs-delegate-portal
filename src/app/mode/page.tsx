// src/app/mode/page.tsx
import "server-only";
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/lib/auth/current-actor";
import { ModeCode, pathForMode, roleAllowsMode } from "@/lib/auth/mode";
import { entryForActor } from "@/lib/auth/roles";

export const runtime = "nodejs";

function ModeCard({
  title,
  desc,
  mode,
}: {
  title: string;
  desc: string;
  mode: ModeCode;
}) {
  return (
    <form method="POST" action="/mode/set">
      <input type="hidden" name="mode" value={mode} />
      <button
        type="submit"
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid #ddd",
          background: "white",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ opacity: 0.8 }}>{desc}</div>
      </button>
    </form>
  );
}

export default async function ModePage() {
  const actor = await requireCurrentActor();
  const role = String(actor.role ?? "").toUpperCase();

  // Roles con dashboard exclusivo NO usan selector de modo
  if (
    role === "COORDINATOR_COMMERCIAL" ||
    role === "KOL" ||
    role === "CLIENT"
  ) {
    redirect(
      entryForActor({
        role: actor.role,
        commission_level: actor.commission_level,
      })
    );
  }

  const canControlRoom = roleAllowsMode(role, "control-room");
  const canDelegate = roleAllowsMode(role, "delegate");
  const canClient = roleAllowsMode(role, "client");

  const allowed: ModeCode[] = [];
  if (canControlRoom) allowed.push("control-room");
  if (canDelegate) allowed.push("delegate");
  if (canClient) allowed.push("client");

  // Si solo hay un modo posible, no mostramos selector
  if (allowed.length === 1) {
    redirect(pathForMode(allowed[0]));
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Elegir modo
      </h1>
      <p style={{ marginBottom: 24, opacity: 0.8 }}>
        Este selector solo cambia la <b>entrada</b> y la <b>UI</b>. Los permisos
        reales siguen gobernados por RLS y guards.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {canControlRoom && (
          <ModeCard
            title="Control Room"
            desc="KPIs, operativa y administración (supervisión)"
            mode="control-room"
          />
        )}

        {canDelegate && (
          <ModeCard
            title="Delegate"
            desc="Cartera, clientes, ventas y seguimiento"
            mode="delegate"
          />
        )}

        {canClient && (
          <ModeCard
            title="Client"
            desc="Ficha, referidos y liquidaciones"
            mode="client"
          />
        )}
      </div>

      <div style={{ marginTop: 24, opacity: 0.75, fontSize: 14 }}>
        Rol detectado: <b>{role || "(vacío)"}</b>
      </div>
    </main>
  );
}
