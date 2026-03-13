"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import PortalShell, {
  type PortalShellTab,
} from "@/components/portal/PortalShell";
import ComunidadViholabs from "@/components/portal/ComunidadViholabs";
import { useCommunityProfile } from "@/components/portal/community/useCommunityProfile";

export default function ControlRoomShell({
  children,
}: {
  children: ReactNode;
}) {
  const { profile, loading, isMelquisedec } = useCommunityProfile();

  const tabs: PortalShellTab[] = [
    {
      href: "/control-room/shell?tab=situation",
      label: "Situation",
      hint: "Visión general",
    },
    {
      href: "/control-room/shell?tab=clients",
      label: "Clients",
      hint: "Clientes",
    },
    {
      href: "/control-room/shell?tab=facturacion",
      label: "Facturación",
      hint: "Documentos",
    },
    {
      href: "/control-room/shell?tab=recursos",
      label: "Recursos",
      hint: "Herramientas",
    },
  ];

  if (isMelquisedec || String(profile.role ?? "").toLowerCase() === "melquisedec") {
    tabs.push({
      href: "/control-room/shell?tab=el-elyon",
      label: "El-Elyon",
      hint: "Soberanía",
    });
  }

  return (
    <PortalShell
      sidebar={<ComunidadViholabs />}
      tabs={tabs}
      rightHeaderSlot={
        <div className="flex items-center gap-3">
          {!loading && (
            <span
              className="text-xs font-medium"
              style={{ color: "var(--viho-muted)" }}
            >
              {String(profile.role ?? "—")}
            </span>
          )}

          <Link
            href="/logout"
            className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-[color:var(--viho-surface-2)]"
            style={{
              borderColor: "var(--viho-border)",
              color: "var(--viho-primary)",
            }}
          >
            Cerrar sesión
          </Link>
        </div>
      }
    >
      {children}
    </PortalShell>
  );
}