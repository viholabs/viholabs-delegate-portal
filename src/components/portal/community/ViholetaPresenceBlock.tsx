"use client";

import type { ReactNode } from "react";
import ViholetaAvatarSvg from "./ViholetaAvatarSvg";

type Props = {
  compact?: boolean;
  showDivider?: boolean;
  line?: string;
  label?: string;

  /** callback opcional: el contenidor (agent) hi connectarà l’acció d’“activar” */
  onActivate?: () => void;
};

export default function ViholetaPresenceBlock(props: Props): ReactNode {
  const { compact = false, showDivider = false, line, label = "VIHOLETA", onActivate } = props;

  const text =
    (line && String(line).trim()) ||
    "Presencia institucional activa. Si hoy toca silencio, lo respetamos.";

  return (
    <div className={compact ? "" : "mt-4"}>
      {showDivider ? (
        <div className="mb-3 h-px w-full" style={{ background: "var(--viho-border)" }} aria-hidden="true" />
      ) : null}

      <button
        type="button"
        onClick={onActivate}
        className="w-full rounded-2xl border px-3 py-3 text-left transition"
        style={{
          borderColor: "var(--viho-border)",
          background: "var(--viho-surface)",
        }}
        aria-label="Abrir Viholeta"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0" style={{ opacity: 0.95 }}>
            <ViholetaAvatarSvg size={34} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-[11px] font-semibold tracking-[0.18em]"
                style={{ color: "var(--viho-primary)" }}
              >
                {label}
              </div>

              <div className="text-[11px]" style={{ color: "var(--viho-muted)" }}>
                activar →
              </div>
            </div>

            <div className="mt-2 text-[12px] leading-5" style={{ color: "var(--viho-muted)" }}>
              <span style={{ color: "var(--viho-text)" }}>Viholeta</span>: {text}
            </div>
          </div>
        </div>

        <style jsx>{`
          button:hover {
            border-color: color-mix(in srgb, var(--viho-border) 55%, var(--viho-gold, #c7ae6a));
            background: color-mix(in srgb, var(--viho-surface) 92%, var(--viho-gold, #c7ae6a));
          }
          button:focus-visible {
            outline: 2px solid color-mix(in srgb, var(--viho-gold, #c7ae6a) 70%, transparent);
            outline-offset: 2px;
          }
        `}</style>
      </button>
    </div>
  );
}
