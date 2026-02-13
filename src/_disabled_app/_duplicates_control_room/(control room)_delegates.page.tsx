// src/app/(control room)/delegates/page.tsx
import { Suspense } from "react";
import DelegatesClient from "./DelegatesClient";

export default function ControlRoomDelegatesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Cargando…</div>}>
      <DelegatesClient />
    </Suspense>
  );
}
