"use client";

import type React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function getErrorMessage(error: string | null) {
  switch (error) {
    case "missing_credentials":
      return "Debes introducir email y contraseña.";
    case "auth_failed":
      return "Email o contraseña incorrectos.";
    case "no_session":
      return "No se ha podido iniciar la sesión.";
    case "missing_supabase_env":
      return "Falta configuración de autenticación en el servidor.";
    case "server_error":
      return "Se ha producido un error interno.";
    case "auth_required":
      return "Debes iniciar sesión para continuar.";
    case "auth_failed_callback":
      return "No se ha podido completar la autenticación.";
    default:
      return error ? `Error: ${error}` : null;
  }
}

export default function LoginClient() {
  const sp = useSearchParams();
  const error = sp.get("error");
  const reset = sp.get("reset");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const errorMessage = useMemo(() => getErrorMessage(error), [error]);

  function onSubmit() {
    setLoading(true);
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
        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 700,
              color: "#1f1a14",
            }}
          >
            Iniciar sesión
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: 15,
              lineHeight: 1.5,
              color: "#5f564b",
            }}
          >
            Accede al portal con tu email y tu contraseña.
          </p>
        </div>

        {errorMessage ? (
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
            {errorMessage}
          </div>
        ) : null}

        {reset === "success" ? (
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
            Tu contraseña se ha actualizado correctamente. Ya puedes iniciar sesión.
          </div>
        ) : null}

        <form
          action="/auth/password"
          method="POST"
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 16 }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <label
              htmlFor="email"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#2f2923",
              }}
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="tu@email.com"
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <label
                htmlFor="password"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#2f2923",
                }}
              >
                Contraseña
              </label>

              <span
                style={{
                  fontSize: 13,
                  color: "#7a6f61",
                }}
              >
                Mínimo 8 caracteres
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Tu contraseña"
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

              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: "1px solid #cfc4b2",
                  background: "#f7f1e6",
                  padding: "0 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#3d352d",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

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
              marginTop: 4,
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#2f2923",
              }}
            >
              ¿Has olvidado tu contraseña?
            </div>

            <Link
              href="/forgot-password"
              style={{
                fontSize: 14,
                color: "#4d4337",
                textDecoration: "underline",
              }}
            >
              Restablece tu contraseña.
            </Link>
          </div>
          <Link
            href="/"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#4d4337",
              textDecoration: "underline",
              marginTop: 4,
            }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}