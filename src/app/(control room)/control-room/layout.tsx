import type { ReactNode } from "react";
import ControlRoomShell from "@/components/control-room/ControlRoomShell";

export default function ControlRoomLayout({ children }: { children: ReactNode }) {
  return <ControlRoomShell>{children}</ControlRoomShell>;
}
