"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ResultItem = {
  fileName: string;
  ok: boolean;
  status: number;
  payload: any;
};

function prettyJSON(x: any) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function isYYYYMM(s: string) {
  return /^\d{4}-\d{2}$/.test(s);
}

export default function ImportPage() {
  const supabase = createClient();

  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ResultItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const okCount = useMemo(() => results.filter((r) => r.ok).length, [results]);
  const errCount = useMemo(() => results.filter((r) => !r.ok).length, [results]);

  const reviewHref = useMemo(() => {
    const m = isYYYYMM(month) ? month : "";
    const qs = new URLSearchParams();
    if (m) qs.set("month", m);
    qs.set("needs_review", "1");
    return `/control-room/invoices?${qs.toString()}`;
  }, [month]);

  function handlePickFilesClick() {
    fileInputRef.current?.click();
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    setResults([]);
    setProgress(0);

    // ✅ Permite volver a elegir el mismo archivo seguidamente
    e.target.value = "";
  }

  async function handleImport() {
    if (!isYYYYMM(month)) {
      setResults([
        {
          fileName: "(mes)",
          ok: false,
          status: 422,
          payload: { ok: false, stage: "ui:month", error: "Mes inválido. Usa formato YYYY-MM (ej: 2026-01)." },
        },
      ]);
      return;
    }

    if (files.length === 0) return;

    setBusy(true);
    setProgress(0);
    setResults([]);

    // ✅ token de sesión
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;

    if (sessErr || !accessToken) {
      setResults([
        {
          fileName: "(sesión)",
          ok: false,
          status: 401,
          payload: {
            ok: false,
            stage: "auth",
            error: "No hay sesión activa. Ve a /login y entra de nuevo.",
            detail: sessErr?.message ?? null,
          },
        },
      ]);
      setBusy(false);
      return;
    }

    const localResults: ResultItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];

      try {
        const fd = new FormData();
        fd.append("month", month);
        fd.append("file", f);

        // ✅ Timeout por archivo (25s)
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 25000);

        const res = await fetch("/api/import-invoice", {
          method: "POST",
          body: fd,
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        }).finally(() => clearTimeout(t));

        const payload = await res.json().catch(() => ({ ok: false, error: "Respuesta no-JSON" }));

        localResults.push({
          fileName: f.name,
          ok: !!payload?.ok && res.ok,
          status: res.status,
          payload,
        });
      } catch (e: any) {
        localResults.push({
          fileName: f.name,
          ok: false,
          status: 0,
          payload: { ok: false, stage: "fetch", error: e?.message ?? "Error desconocido" },
        });
      }

      const pct = Math.round(((i + 1) / files.length) * 100);
      setProgress(pct);
      setResults([...localResults]);
    }

    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest" style={{ color: "rgba(89,49,60,0.7)" }}>
          VIHOLABS · IMPORTACIÓN
        </div>
        <h1 className="mt-2 text-3xl font-semibold" style={{ color: "#59313c" }}>
          Importar PDFs
        </h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(42,29,32,0.65)" }}>
          Sube un lote de facturas. Después, valida “pagada / origen / delegado” en Facturas (needs review).
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={reviewHref}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-white/40"
            style={{ borderColor: "rgba(89,49,60,0.15)" }}
          >
            Ir a validar importadas (needs review)
          </Link>

          <Link
            href="/control-room/dashboard"
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-white/40"
            style={{ borderColor: "rgba(89,49,60,0.15)" }}
          >
            Volver al Control Room
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(89,49,60,0.12)", background: "#fff" }}>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(42,29,32,0.65)" }}>
              Mes (YYYY-MM)
            </div>
            <input
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              style={{ borderColor: "rgba(89,49,60,0.18)" }}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="2026-01"
              disabled={busy}
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(42,29,32,0.65)" }}>
              Archivos PDF
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleFilesSelected}
                style={{ display: "none" }}
              />

              <button
                onClick={handlePickFilesClick}
                disabled={busy}
                className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-white/40"
                style={{ borderColor: "rgba(89,49,60,0.15)" }}
              >
                Seleccionar PDFs
              </button>

              <button
                onClick={handleImport}
                disabled={busy || files.length === 0 || !isYYYYMM(month)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "#59313c", opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "Importando…" : "Importar"}
              </button>

              <div className="text-sm" style={{ color: "rgba(42,29,32,0.65)" }}>
                {files.length > 0 ? `${files.length} archivo(s) seleccionados` : "—"}
              </div>
            </div>

            {busy ? (
              <div className="mt-3">
                <div className="h-2 w-full rounded-full" style={{ background: "rgba(89,49,60,0.10)" }}>
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${progress}%`, background: "#59313c", transition: "width 150ms ease" }}
                  />
                </div>
                <div className="mt-2 text-xs" style={{ color: "rgba(42,29,32,0.65)" }}>
                  Progreso: {progress}%
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {results.length > 0 ? (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm" style={{ color: "rgba(42,29,32,0.8)" }}>
                <b>Resultados</b> · OK: {okCount} · Errores: {errCount}
              </div>

              {okCount > 0 ? (
                <Link
                  href={reviewHref}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: "#f28444" }}
                >
                  Validar importadas ahora
                </Link>
              ) : null}
            </div>

            <div className="space-y-3">
              {results.map((r, idx) => (
                <div
                  key={`${r.fileName}-${idx}`}
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: r.ok ? "rgba(76,139,95,0.35)" : "rgba(192,70,70,0.35)",
                    background: r.ok ? "rgba(76,139,95,0.06)" : "rgba(192,70,70,0.06)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold" style={{ color: "rgba(42,29,32,0.9)" }}>
                      {r.fileName}
                    </div>
                    <div
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        background: r.ok ? "rgba(76,139,95,0.15)" : "rgba(192,70,70,0.15)",
                        color: r.ok ? "#2f6a44" : "#8f2d2d",
                      }}
                    >
                      {r.ok ? "OK" : "ERROR"} · {r.status || "—"}
                    </div>
                  </div>

                  <div className="mt-3">
                    <pre
                      className="max-h-56 overflow-auto rounded-xl p-3 text-xs"
                      style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(89,49,60,0.10)" }}
                    >
                      {prettyJSON(r.payload)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-xs" style={{ color: "rgba(42,29,32,0.55)" }}>
        Flujo recomendado: Importar aquí → “Validar importadas ahora” → completar pagada/origen/delegado (y aplicar al cliente si toca).
      </div>
    </div>
  );
}
