"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    <div
      className="min-h-screen"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Header */}
        <header className="mb-6">
          <div
            className="text-xs uppercase tracking-widest"
            style={{ color: "rgba(89,49,60,0.7)" }}
          >
            VIHOLABS · CONTROL ROOM
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: "#59313c" }}>
                Portal Super Administrador
              </h1>
              <p className="text-sm" style={{ color: "rgba(42,29,32,0.65)" }}>
                Operativa, KPIs y administración (MVP).
              </p>
            </div>

            <Link
              href="/logout"
              className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-white/40"
              style={{ borderColor: "rgba(89,49,60,0.15)" }}
            >
              Salir
            </Link>
          </div>
        </header>

        {/* Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <aside>
            <SidebarNav />
          </aside>

          <main className="min-w-0">
            {/* Breadcrumb + título contextual */}
            <div className="mb-4">
              <div
                className="text-xs uppercase tracking-wider"
                style={{ color: "rgba(89,49,60,0.6)" }}
              >
                Control Room
                {title && title !== "Control Room" ? ` / ${title}` : ""}
              </div>

              <h2
                className="mt-1 text-xl font-semibold"
                style={{ color: "#59313c" }}
              >
                {title}
              </h2>
            </div>

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
