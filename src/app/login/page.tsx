"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

function getCanonicalBaseUrl() {
  const { protocol, hostname } = window.location;

  // Codespaces forwarded domain ya incluye el puerto en el subdominio: "-3000.app.github.dev"
  // En ese caso, NUNCA debemos añadir ":3000"
  if (hostname.endsWith(".app.github.dev") && hostname.includes("-3000")) {
    return `${protocol}//${hostname}`;
  }

  // En local u otros entornos, sí usamos origin completo (incluye puerto si aplica)
  return window.location.origin;
}

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const baseUrl = getCanonicalBaseUrl();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) setStatus(`Error: ${error.message}`);
    else
      setStatus(
        "✅ Enlace enviado. Ábrelo en ESTE mismo navegador (mismo perfil)."
      );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Acceso al portal</h1>
        <p className="text-sm opacity-80">
          Introduce tu email y recibirás un enlace de acceso.
        </p>

        <form onSubmit={sendMagicLink} className="space-y-3">
          <input
            className="w-full border rounded-md p-3"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button
            className="w-full rounded-md bg-black text-white p-3 disabled:opacity-50"
            disabled={loading || !email}
            type="submit"
          >
            {loading ? "Enviando..." : "Enviar magic link"}
          </button>
        </form>

        {status && <p className="text-sm">{status}</p>}
      </div>
    </main>
  );
}
