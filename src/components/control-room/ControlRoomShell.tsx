"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import PortalShell, {
  type PortalShellTab,
} from "@/components/portal/PortalShell";
import ComunidadViholabs from "@/components/portal/ComunidadViholabs";
import { useCommunityProfile } from "@/components/portal/community/useCommunityProfile";

function normalizeRole(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function canSeeDelegatesTab(role: unknown, isMelquisedec: boolean): boolean {
  if (isMelquisedec) return true;

  const normalized = normalizeRole(role);

  return [
    "melquisedec",
    "superadmin",
    "super_admin",
    "administrative",
    "administrativa",
    "coordinador_comercial",
    "commercial_coordinator",
    "kol",
    "delegate",
  ].includes(normalized);
}

function canSeeElElyonTab(role: unknown, isMelquisedec: boolean): boolean {
  if (isMelquisedec) return true;

  const normalized = normalizeRole(role);

  return normalized === "melquisedec";
}

export default function ControlRoomShell({
  children,
}: {
  children: ReactNode;
}) {
  const { profile, loading, isMelquisedec } = useCommunityProfile();

  const role = String(profile.role ?? "");
  const showDelegatesTab = canSeeDelegatesTab(role, isMelquisedec);
  const showElElyonTab = canSeeElElyonTab(role, isMelquisedec);

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
  ];

  if (showDelegatesTab) {
    tabs.push({
      href: "/control-room/delegates",
      label: "Delegados",
      hint: "Red comercial",
    });
  }

  tabs.push({
    href: "/control-room/shell?tab=recursos",
    label: "Recursos",
    hint: "Herramientas",
  });

  if (showElElyonTab) {
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