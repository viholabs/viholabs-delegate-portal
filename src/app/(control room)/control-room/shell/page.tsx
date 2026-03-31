import { Suspense } from "react";
import ShellPageClient from "./ShellPageClient";

export const runtime = "nodejs";

function ShellPageFallback() {
  return (
    <div className="p-6">
      <div className="text-sm text-muted-foreground">Cargando Control Room...</div>
    </div>
  );
}

export default function ControlRoomShellPage() {
  return (
    <Suspense fallback={<ShellPageFallback />}>
      <ShellPageClient />
    </Suspense>
  );
}