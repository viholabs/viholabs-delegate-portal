"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import SidebarNav from "@/components/control-room/SidebarNav";

export default function ControlRoomShell({ children }: { children: ReactNode }) {
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

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
