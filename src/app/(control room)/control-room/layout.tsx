// src/app/(control room)/control-room/layout.tsx
//
// VIHOLABS — Control Room Layout (CANONICAL WRAPPER)
// Contracte:
// - El layout NO defineix la pell.
// - La pell única és PortalShell via ControlRoomShell.
// - Aquest fitxer només wrappeja children amb ControlRoomShell.

import type { ReactNode } from "react";
import ControlRoomShell from "@/components/control-room/ControlRoomShell";

export default function Layout({ children }: { children: ReactNode }) {
  return <ControlRoomShell>{children}</ControlRoomShell>;
}
