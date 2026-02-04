// src/app/(control room)/control-room/dashboard/page.tsx
import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export default function ControlRoomDashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Cargando…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
