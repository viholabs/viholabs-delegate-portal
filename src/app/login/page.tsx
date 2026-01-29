"use client";

import { useState } from "react";
import type React from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  // ✅ Default: Super Admin dashboard (según tu decisión)
  const next = searchParams.get("next") ?? "/control-room/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const supabase = createClient();

      // ✅ Robusto: en navegador usa origin real; fallback a env
      const siteUrl =
        (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/$/, "");

      if (!siteUrl) {
        setLoading(false);
        setMsg("Falta NEXT_PUBLIC_SITE_URL o no se detecta el origin.");
        return;
      }

      const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        setLoading(false);
        setMsg(error.message);
        return;
      }

      setSent(true);
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      setMsg(err?.message ?? "Error desconocido");
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Login</h1>

      {error ? (
        <p style={{ color: "crimson", marginBottom: 12 }}>
          Error: <b>{error}</b>
        </p>
      ) : null}

      {msg ? (
        <p style={{ color: "crimson", marginBottom: 12 }}>
          {msg}
        </p>
      ) : null}

      {sent ? (
        <div>
          <p style={{ marginBottom: 12 }}>
            Te he enviado un magic link a <b>{email}</b>. Abre el correo y haz clic.
          </p>
          <button
            onClick={() => {
              setSent(false);
              setEmail("");
              setMsg(null);
            }}
          >
            Enviar a otro email
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", marginBottom: 6 }}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="tu@email.com"
            style={{ width: "100%", padding: 10, marginBottom: 12 }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{ padding: "10px 14px", width: "100%" }}
          >
            {loading ? "Enviando..." : "Enviar magic link"}
          </button>

          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
            Al entrar, te redirige a: <b>{next}</b>
          </p>
        </form>
      )}
    </div>
  );
}
