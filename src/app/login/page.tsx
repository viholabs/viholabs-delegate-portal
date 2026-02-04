// src/app/login/page.tsx
import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Cargando…</div>}>
      <LoginClient />
    </Suspense>
  );
}
