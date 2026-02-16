// src/components/portal/community/ViholetaOpenOverlay.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ViholetaOpenMode = "window" | "tab";

type Props = {
  /** Control externo */
  open: boolean;

  /** Callback al elegir modo */
  onChoose: (mode: ViholetaOpenMode) => void;

  /** Cerrar overlay (click fuera / ESC) */
  onClose: () => void;

  /** Opcional: copy institucional */
  title?: string; // default: "VIHOLETA"
  subtitle?: string; // default: "Seleccione el régimen de trabajo"
  optionA?: string; // default: "Espacio dedicado"
  optionB?: string; // default: "Consulta contextual"
};

/**
 * VIHOLABS — Viholeta Opening Overlay (CANÓNICO)
 * - NO modal SaaS: sin sombras fuertes, sin blur agresivo, sin bounce
 * - Timing perceptual: 140–180ms veil + 90–130ms panel
 * - Tokens: --viho-*
 */
export default function ViholetaOpenOverlay(props: Props) {
  const {
    open,
    onChoose,
    onClose,
    title = "VIHOLETA",
    subtitle = "Seleccione el régimen de trabajo",
    optionA = "Espacio dedicado",
    optionB = "Consulta contextual",
  } = props;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Mantener montado el tiempo justo para animación de salida
  useEffect(() => {
    if (open) setMounted(true);
    else {
      const t = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus inicial al panel (sin “autofocus” agresivo)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => panelRef.current?.focus(), 180);
    return () => clearTimeout(t);
  }, [open]);

  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  if (!mounted) return null;

  const VEIL_MS = reduceMotion ? 0 : 160; // 140–180 ms
  const PANEL_MS = reduceMotion ? 0 : 110; // 90–130 ms

  return (
    <div
      aria-hidden={!open}
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      style={{
        // capa: atmósfera, no “bloqueo”
        pointerEvents: open ? "auto" : "none",
      }}
      onMouseDown={(e) => {
        // click fuera cierra (pero sin dramatismo)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Veil */}
      <div
        className="absolute inset-0"
        style={{
          background: "color-mix(in srgb, var(--background) 86%, var(--viho-primary, #5A2E3A) 14%)",
          opacity: open ? 0.16 : 0,
          transition: `opacity ${VEIL_MS}ms ease-out`,
        }}
      />

      {/* Placa editorial */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Viholeta"
        className="relative w-full max-w-[520px] rounded-[22px] border px-5 py-5 outline-none"
        style={{
          borderColor: "var(--viho-border)",
          background: "var(--viho-surface)",
          // sin sombra SaaS: solo separación mínima por contraste
          boxShadow: "0 0 0 1px color-mix(in srgb, var(--viho-border) 62%, transparent)",
          transform: open ? "translateY(0px)" : "translateY(6px)",
          opacity: open ? 1 : 0,
          transition: `opacity ${PANEL_MS}ms ease-out, transform ${PANEL_MS}ms ease-out`,
        }}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-4">
          <div
            className="text-[11px] font-semibold tracking-[0.22em]"
            style={{ color: "var(--viho-primary)" }}
          >
            {title}
          </div>

          {/* hairline + punto (firma) */}
          <div className="relative h-[10px] w-[120px]" aria-hidden="true">
            <div
              className="absolute left-0 right-0 top-[5px] h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent 0%, var(--viho-gold, #C7AE6A) 18%, var(--viho-gold, #C7AE6A) 82%, transparent 100%)",
                opacity: 0.55,
              }}
            />
            <div
              className="absolute top-[2px] h-[6px] w-[6px] rounded-full"
              style={{ left: "calc(52% - 3px)", background: "var(--viho-gold, #C7AE6A)" }}
            />
            <div
              className="absolute top-[2px] h-[6px] w-[6px] rounded-full"
              style={{ left: "calc(72% - 3px)", background: "var(--viho-orange, #FF7A2F)", opacity: 0.92 }}
            />
          </div>
        </div>

        <div className="mt-3 text-[13px] leading-6" style={{ color: "var(--viho-muted)" }}>
          {subtitle}
        </div>

        {/* Opciones (no “botones SaaS”: placas sobrias) */}
        <div className="mt-4 grid gap-2">
          <ChoiceRow
            label={optionA}
            hint="Entorno dedicado · profundidad"
            onClick={() => onChoose("window")}
          />
          <ChoiceRow
            label={optionB}
            hint="Dentro del Portal · consulta"
            onClick={() => onChoose("tab")}
          />
        </div>

        {/* Línea final: institucional, no conversacional */}
        <div className="mt-4 text-[12px]" style={{ color: "var(--viho-muted)" }}>
          La elección define el marco de trabajo, no la autoridad cognitiva.
        </div>
      </div>
    </div>
  );
}

function ChoiceRow(props: { label: string; hint: string; onClick: () => void }) {
  const { label, hint, onClick } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border px-4 py-3 text-left transition"
      style={{
        borderColor: "var(--viho-border)",
        background: "color-mix(in srgb, var(--viho-surface) 92%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium" style={{ color: "var(--viho-text)" }}>
            {label}
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--viho-muted)" }}>
            {hint}
          </div>
        </div>

        {/* Indicador mínimo (no CTA agresivo) */}
        <div className="text-[12px]" style={{ color: "var(--viho-muted)" }}>
          abrir →
        </div>
      </div>

      <style jsx>{`
        button:hover {
          border-color: color-mix(in srgb, var(--viho-border) 58%, var(--viho-gold, #c7ae6a));
          background: color-mix(in srgb, var(--viho-surface) 90%, var(--viho-gold, #c7ae6a));
        }
        button:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--viho-gold, #c7ae6a) 70%, transparent);
          outline-offset: 2px;
        }
      `}</style>
    </button>
  );
}
