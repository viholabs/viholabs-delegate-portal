import type { ReactNode } from "react";
import DelegateShell from "@/components/Delegate/DelegateShell";

export default function DelegateLayout({ children }: { children: ReactNode }) {
  return <DelegateShell>{children}</DelegateShell>;
}
