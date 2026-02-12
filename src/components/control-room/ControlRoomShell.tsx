"use client";

/**
 * VIHOLABS — ControlRoomShell (CONFIG WRAPPER over PortalShell)
 * Contracte canònic:
 * - ControlRoomShell NO és una pell pròpia.
 * - La pell única del portal és PortalShell.
 * - Només tokens (cap hex/rgba inline).
 */

import type { ReactNode } from "react";
import Link from "next/link";
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
  const pageTitle = titleForPath(pathname);

  return (
    <PortalShell
      sidebar={<SidebarNav />}
      header={{
        kicker: "VIHOLABS · CONTROL ROOM",
        title: "Portal Super Administrador",
        subtitle: "Operativa, KPIs y administración (MVP).",
        badgeText: pageTitle,
      }}
      className="min-h-screen"
    >
      {/* Acció superior institucional (logout) */}
      <div className="mb-4 flex justify-end">
        <Link
          href="/logout"
          className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-white/40"
          style={{ borderColor: "var(--viho-border)" }}
        >
          Salir
        </Link>
      </div>

      {children}
    </PortalShell>
  );
}
