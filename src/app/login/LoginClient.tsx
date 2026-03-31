"use client";

import type React from "react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

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
      // 🔥 IMPORTANTE: navegación real, no fetch
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/auth/password";

      const emailInput = document.createElement("input");
      emailInput.name = "email";
      emailInput.value = email.trim();

      const passInput = document.createElement("input");
      passInput.name = "password";
      passInput.value = password;

      form.appendChild(emailInput);
      form.appendChild(passInput);

      document.body.appendChild(form);
      form.submit();
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

      {msg ? <p style={{ color: "crimson", marginBottom: 12 }}>{msg}</p> : null}

      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label>Contraseña</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}