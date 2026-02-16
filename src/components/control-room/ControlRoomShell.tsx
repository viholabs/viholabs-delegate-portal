"use client";

/**
 * VIHOLABS — ControlRoomShell (CANONICAL WRAPPER over PortalShell)
 *
 * Contracte:
 * - Single Shell: PortalShell
 * - Side Hall: ComunidadViholabs (Community Bar)
 * - Tabs visibles: derivades del rol real (cookie viholabs_role)
 * - NO SidebarNav (substituïda per Community Bar)
 *
 * IMPORTANT (Hydration):
 * - NO llegir document.cookie durant render.
 * - Llegir cookies només després de mount (useEffect).
 */

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import PortalShell from "@/components/portal/PortalShell";
import ComunidadViholabs from "@/components/portal/ComunidadViholabs";

import {
  getVisibleTabsForSystemRole,
  toPortalShellTabs,
  type VihoRole,
} from "@/components/portal/tabs/tab-visibility";

function readCookie(name: string): string | null {
  try {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(new RegExp("(^|; )" + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") + "=([^;]*)"));
    return m ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}

export default function ControlRoomShell({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<VihoRole | null>(null);

  // 1) Llegir rol real després de mount (cookie set a /auth/callback)
  useEffect(() => {
    const r = (readCookie("viholabs_role") || "").trim().toUpperCase();
    setRole((r as VihoRole) || null);
  }, []);

  // 2) Tabs visibles segons rol real (si encara no hi ha rol, cap tab)
  const tabs = useMemo(() => {
    if (!role) return [];
    const visible = getVisibleTabsForSystemRole(role);
    return toPortalShellTabs(visible);
  }, [role]);

  // 3) Header institucional (mínim; el contingut viu dins /control-room/shell?tab=)
  const header = useMemo(
    () => ({
      title: "CONTROL ROOM",
      subtitle: role ? `Rol: ${role}` : "—",
    }),
    [role]
  );

  return (
    <PortalShell sidebar={<ComunidadViholabs />} tabs={tabs} header={header}>
      {children}
    </PortalShell>
  );
}
