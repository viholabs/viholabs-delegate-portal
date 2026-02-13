// src/app/(delegate)/delegate/dashboard/page.tsx
import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default function DelegateDashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Cargando…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
