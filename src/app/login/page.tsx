// src/app/login/page.tsx
"use client";

import type React from "react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
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
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setLoading(false);
        setMsg(error.message);
        return;
      }

      if (!data?.session) {
        setLoading(false);
        setMsg("No se pudo iniciar sesión. Revisa email y contraseña.");
        return;
      }

      // Importante: dejamos que tu lógica central redirija por rol
      // (src/app/page.tsx y/o /dashboard)
      window.location.assign("/");
    } catch (err: any) {
      setMsg(err?.message ?? "Error desconocido");
      setLoading(false);
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
        <p style={{ color: "crimson", marginBottom: 12 }}>{msg}</p>
      ) : null}

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

        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Acceso solo con email + contraseña.
        </p>
      </form>
    </div>
  );
}
