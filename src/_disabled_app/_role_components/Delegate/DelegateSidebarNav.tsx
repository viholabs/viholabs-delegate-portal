"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  href: string;
  desc?: string;
};

function withDelegateId(href: string, delegateId?: string) {
  if (!delegateId) return href;
  const u = new URL(href, "http://local");
  u.searchParams.set("delegateId", delegateId);
  return u.pathname + "?" + u.searchParams.toString();
}

export default function DelegateSidebarNav({
  delegateId,
  pathname,
}: {
  delegateId?: string;
  pathname: string;
}) {
  const items: Item[] = useMemo(
    () => [
      {
        label: "Dashboard",
        href: "/delegate/dashboard",
        desc: "Resumen del mes",
      },

      {
        label: "Crear Cliente",
        href: "/delegate/clients/new",
        desc: "Alta + recomendador",
      },
      {
        label: "Crear Pedido",
        href: "/delegate/orders/new",
        desc: "Venta + FOC + email",
      },
      {
        label: "Seguir pedidos pendientes",
        href: "/delegate/orders",
        desc: "Estados y seguimiento",
      },
      {
        label: "Facturación y pagos",
        href: "/delegate/invoices",
        desc: "Cobradas / pendientes",
      },
      {
        label: "Comisiones y liquidaciones",
        href: "/delegate/commissions",
        desc: "Histórico y estatus",
      },
    ],
    []
  );

  return (
    <nav className="space-y-1">
      {items.map((it) => {
        const href = withDelegateId(it.href, delegateId);
        const isActive =
          pathname === it.href || pathname.startsWith(it.href + "/");

        return (
          <Link
            key={it.href}
            href={href}
            className={cn(
              "group flex flex-col gap-0.5 rounded-xl px-3 py-2 transition",
              "hover:bg-[#f3e7e2]",
              isActive ? "bg-[#f3e7e2] border border-[#db9d87]" : "border border-transparent"
            )}
          >
            <div className="flex items-center justify-between">
              <div
                className={cn(
                  "text-sm font-medium",
                  isActive ? "text-[#59313c]" : "text-[#59313c]"
                )}
              >
                {it.label}
              </div>

              <span
                className={cn(
                  "text-[10px] rounded-full px-2 py-0.5 border",
                  isActive
                    ? "border-[#f28444] text-[#f28444] bg-white"
                    : "border-[#d9c2ba] text-muted-foreground bg-white"
                )}
              >
                MVP
              </span>
            </div>

            {it.desc ? (
              <div className="text-xs text-muted-foreground">{it.desc}</div>
            ) : null}
          </Link>
        );
      })}

      <div className="mt-3 rounded-xl border bg-white px-3 py-3">
        <div className="text-xs font-semibold text-[#59313c]">Notas</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Este menú replica el patrón del Control Room.  
          En el punto 2 conectamos cada pantalla (formularios, pedidos, estados, etc.).
        </div>
      </div>
    </nav>
  );
}
