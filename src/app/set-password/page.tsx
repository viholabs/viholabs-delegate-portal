"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordError = useMemo(() => {
    if (!password || !confirmPassword) return null;
    if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
    if (password !== confirmPassword) return "Las contraseñas no coinciden.";
    return null;
  }, [password, confirmPassword]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDone(false);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message || "No se ha podido actualizar la contraseña.");
        setLoading(false);
        return;
      }

      setDone(true);
      setLoading(false);

      window.setTimeout(() => {
        window.location.href = "/login?reset=success";
      }, 1200);
    } catch (err: any) {
      setError(err?.message ?? "Se ha producido un error.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f3efe7",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#ffffff",
          border: "1px solid #e7dfd1",
          borderRadius: 18,
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          padding: 28,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.15,
            fontWeight: 700,
            color: "#1f1a14",
          }}
        >
          Crear o restablecer contraseña
        </h1>

        <p
          style={{
            marginTop: 10,
            marginBottom: 18,
            fontSize: 15,
            lineHeight: 1.5,
            color: "#5f564b",
          }}
        >
          Introduce tu nueva contraseña para activar o recuperar el acceso.
        </p>

        {error ? (
          <div
            style={{
              marginBottom: 16,
              borderRadius: 12,
              border: "1px solid #efc2c2",
              background: "#fff3f3",
              color: "#8f1d1d",
              padding: "12px 14px",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        ) : null}

        {done ? (
          <div
            style={{
              marginBottom: 16,
              borderRadius: 12,
              border: "1px solid #cfe4c8",
              background: "#f4fbf1",
              color: "#245b1f",
              padding: "12px 14px",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            Contraseña actualizada correctamente. Te redirigimos al login…
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <label
              htmlFor="password"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#2f2923",
              }}
            >
              Nueva contraseña
            </label>

            <input
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
              placeholder="Mínimo 8 caracteres"
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "1px solid #cfc4b2",
                background: "#fffdf9",
                padding: "0 14px",
                fontSize: 16,
                color: "#1f1a14",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label
              htmlFor="confirmPassword"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#2f2923",
              }}
            >
              Repetir contraseña
            </label>

            <input
              id="confirmPassword"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
              placeholder="Repite la contraseña"
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "1px solid #cfc4b2",
                background: "#fffdf9",
                padding: "0 14px",
                fontSize: 16,
                color: "#1f1a14",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {passwordError ? (
            <div
              style={{
                fontSize: 13,
                color: "#8f1d1d",
              }}
            >
              {passwordError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: 50,
              borderRadius: 12,
              border: "none",
              background: loading ? "#b7ab99" : "#1f1a14",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>

        <div style={{ marginTop: 18 }}>
          <Link
            href="/login"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#4d4337",
              textDecoration: "underline",
            }}
          >
            Volver al login
          </Link>
        </div>
      </div>
    </div>
  );
}