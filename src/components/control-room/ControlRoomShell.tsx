"use client";

/**
 * VIHOLABS — ControlRoomShell (CONFIG WRAPPER over PortalShell)
 * Contracte canònic:
 * - ControlRoomShell NO és una pell pròpia.
 * - La pell única del portal és PortalShell.
 * - Només aporta configuració: sidebar + header (sense containers estructurals globals).
 */

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import PortalShell from "@/components/portal/PortalShell";
import SidebarNav from "@/components/control-room/SidebarNav";

function titleForPath(pathname: string) {
  if (pathname.startsWith("/control-room/import")) return "Importación";
  if (pathname.startsWith("/control-room/users")) return "Usuarios";
  if (pathname.startsWith("/control-room/delegates")) return "Delegados";
  if (pathname.startsWith("/control-room/clients")) return "Clientes";
  if (pathname.startsWith("/control-room/commission-rules")) return "Normas de comisiones";
  if (pathname.startsWith("/control-room/roles")) return "Permisos y roles";
  if (pathname.startsWith("/control-room/invoices")) return "Facturas";
  if (pathname.startsWith("/control-room/audit")) return "Auditoría";
  if (pathname.startsWith("/control-room/dashboard")) return "Dashboard";
  return "Control Room";
}

export default function ControlRoomShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const title = titleForPath(pathname);

  return (
    <PortalShell
      sidebar={
        <div className="px-3 py-3">
          {/* Identidad */}
          <div className="mb-3 px-2">
            <div
              className="text-xs font-semibold tracking-wide"
              style={{ color: "var(--viho-primary)" }}
            >
              VIHOLABS · CONTROL ROOM
            </div>
            <div className="text-sm" style={{ color: "var(--viho-muted)" }}>
              Operativa y administración
            </div>
          </div>

          {/* Nav */}
          <SidebarNav />

          {/* Acción única (logout) — dentro del sidebar para no romper PortalShell */}
          <div className="mt-4 px-2">
            <a
              href="/logout"
              className="block rounded-xl border px-3 py-2 text-sm font-medium hover:bg-[color:var(--viho-surface-2)]"
              style={{ borderColor: "var(--viho-border)", color: "var(--viho-primary)" }}
            >
              Salir
            </a>
          </div>
        </div>
      }
      header={{
        kicker: "VIHOLABS · CONTROL ROOM",
        title: title === "Control Room" ? "Portal Super Administrador" : title,
        subtitle: "Operativa, KPIs y administración (MVP).",
        badgeText: title && title !== "Control Room" ? `Control Room / ${title}` : "Control Room",
      }}
    >
      {children}
    </PortalShell>
  );
}
