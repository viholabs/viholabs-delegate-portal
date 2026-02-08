"use client";

import type React from "react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginClient() {
  const sp = useSearchParams();
  const error = sp.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      // 1) Login SSR (server) -> crea cookies
      const r = await fetch("/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setLoading(false);
        setMsg(j?.message ?? "No se pudo iniciar sesión. Revisa email y contraseña.");
        return;
      }

      // 2) Flux canònic: callback resol actor + redirigeix per rol
      window.location.assign("/auth/callback");
    } catch (err: any) {
      setMsg(err?.message ?? "Error desconocido");
      setLoading(false);
    }
  }

  async function onForgotPassword() {
    setLoading(true);
    setMsg(null);

    try {
      const supabase = createClient();
      const cleanEmail = email.trim();

      if (!cleanEmail) {
        setLoading(false);
        setMsg("Escribe tu email arriba y luego pulsa “He olvidado la contraseña”.");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        // IMPORTANT: no toquem fluxos tancats; això només envia email.
        // Si més endavant definim una pantalla de reset, ajustarem aquest redirectTo.
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) {
        setLoading(false);
        setMsg(error.message);
        return;
      }

      setLoading(false);
      setMsg("Te hemos enviado un email para restablecer la contraseña (si el email existe).");
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

      {msg ? <p style={{ color: "crimson", marginBottom: 12 }}>{msg}</p> : null}

      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 6 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="tu@email.com"
          autoComplete="email"
          style={{ width: "100%", padding: 10, marginBottom: 12 }}
        />

        <label style={{ display: "block", marginBottom: 6 }}>Contraseña</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          placeholder="••••••••"
          autoComplete="current-password"
          style={{ width: "100%", padding: 10, marginBottom: 12 }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{ padding: "10px 14px", width: "100%" }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <button
          type="button"
          onClick={onForgotPassword}
          disabled={loading}
          style={{
            marginTop: 10,
            padding: "10px 14px",
            width: "100%",
            opacity: 0.9,
          }}
        >
          He olvidado la contraseña
        </button>

        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Acceso solo con email + contraseña.
        </p>
      </form>
    </div>
  );
}

