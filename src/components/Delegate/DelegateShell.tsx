"use client";

import { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import DelegateSidebarNav from "@/components/Delegate/DelegateSidebarNav";
import { cn } from "@/lib/utils";

function titleForPath(pathname: string) {
  if (!pathname) return "Panel del Delegado";
  if (pathname.startsWith("/delegate/dashboard")) return "Dashboard";
  if (pathname.startsWith("/delegate/clients")) return "Clientes";
  if (pathname.startsWith("/delegate/orders")) return "Pedidos";
  if (pathname.startsWith("/delegate/invoices")) return "Facturas";
  if (pathname.startsWith("/delegate/commissions")) return "Comisiones";
  return "Panel del Delegado";
}

export default function DelegateShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const sp = useSearchParams();

  // Mantener delegateId en navegación (modo supervisión / testing)
  const delegateId = sp?.get("delegateId") ?? sp?.get("delegate_id") ?? "";

  const title = titleForPath(pathname);

  return (
    <div className="min-h-screen w-full bg-[#fbf6f4]">
      <div className="mx-auto flex w-full max-w-[1600px] gap-4 px-4 py-4">
        {/* Sidebar */}
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[280px] shrink-0 lg:block">
          <div className="h-full rounded-2xl border bg-white/70 backdrop-blur px-3 py-3 shadow-sm">
            <div className="mb-3 px-2">
              <div className="text-xs font-semibold tracking-wide text-[#59313c]">
                VIHOLABS · DELEGADOS
              </div>
              <div className="text-sm text-muted-foreground">
                Panel operativo
              </div>
            </div>

            <DelegateSidebarNav delegateId={delegateId} pathname={pathname} />
          </div>
        </aside>

        {/* Main */}
        <main className={cn("w-full flex-1", "min-w-0")}>
          {/* Header compacto */}
          <div className="mb-4 rounded-2xl border bg-white/70 backdrop-blur px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-[#59313c]">
                  {title}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  Navegación operativa · pedidos · facturas · comisiones
                </div>
              </div>

              <div className="flex items-center gap-2">
                {delegateId ? (
                  <span className="rounded-full border bg-white px-3 py-1 text-xs text-[#59313c]">
                    Modo supervisión · delegateId:{" "}
                    <span className="font-mono">{delegateId}</span>
                  </span>
                ) : (
                  <span className="rounded-full border bg-white px-3 py-1 text-xs text-[#59313c]">
                    Modo delegado
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
