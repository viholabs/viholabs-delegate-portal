// src/app/(control room)/control-room/layout.tsx
//
// VIHOLABS — Control Room Layout (CANONICAL WRAPPER)
// Contracte:
// - El layout NO defineix la pell.
// - La pell única és PortalShell via ControlRoomShell.
// - Aquest fitxer només wrappeja children amb ControlRoomShell.
//
// Fix build (Next.js): useSearchParams() requires a Suspense boundary.

import type { ReactNode } from "react";
import { Suspense } from "react";
import ControlRoomShell from "@/components/control-room/ControlRoomShell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Cargando…</div>}>
      <ControlRoomShell>{children}</ControlRoomShell>
    </Suspense>
  );
}