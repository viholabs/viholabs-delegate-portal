import { Suspense } from "react";
import ShellPageClient from "./ShellPageClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Cargando Control Room…</div>}>
      <ShellPageClient />
    </Suspense>
  );
}
