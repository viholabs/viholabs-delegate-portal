"use client";

/**
 * VIHOLABS — DelegateShell (CONFIG WRAPPER over PortalShell)
 * Contracte canònic:
 * - DelegateShell NO és una pell pròpia.
 * - La pell única del portal és PortalShell.
 * - Només tokens (cap hex/rgba inline).
 */

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import PortalShell from "@/components/portal/PortalShell";
import DelegateSidebarNav from "@/components/Delegate/DelegateSidebarNav";

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

  const delegateId = sp?.get("delegateId") ?? sp?.get("delegate_id") ?? "";
  const title = titleForPath(pathname);

  return (
    <PortalShell
      sidebar={
        <div className="px-3 py-3">
          <div className="mb-3 px-2">
            <div
              className="text-xs font-semibold tracking-wide"
              style={{ color: "var(--viho-primary)" }}
            >
              VIHOLABS · DELEGADOS
            </div>
            <div className="text-sm" style={{ color: "var(--viho-muted)" }}>
              Panel operativo
            </div>
          </div>

          <DelegateSidebarNav delegateId={delegateId} pathname={pathname} />
        </div>
      }
      header={{
        title,
        subtitle: "Navegación operativa · pedidos · facturas · comisiones",
        badgeText: delegateId ? `Modo supervisión · delegateId: ${delegateId}` : "Modo delegado",
      }}
    >
      {children}
    </PortalShell>
  );
}
