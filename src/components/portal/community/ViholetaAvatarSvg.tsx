"use client";

import type { ReactNode } from "react";

type Props = {
  size?: number;
  title?: string;
};

export default function ViholetaAvatarSvg(props: Props): ReactNode {
  const { size = 34, title = "Viholeta" } = props;

  const PRIMARY = "var(--viho-primary, #5A2E3A)";
  const GOLD = "var(--viho-gold, #C7AE6A)";
  const VIOLET = "var(--viho-violet, #6B4FA3)";
  const MUTED = "var(--viho-muted, #6B6B6B)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>

      {/* Halo institucional molt subtil */}
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        stroke={GOLD}
        strokeOpacity="0.28"
      />

      {/* Tija */}
      <path
        d="M24 34c0-6 0-10 0-14"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Fulles mínimes */}
      <path
        d="M24 26c-4 0-6.5-1.5-8.5-4 4.8-1 8-.2 10.5 2.4"
        fill="none"
        stroke={GOLD}
        strokeOpacity="0.42"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Flor (violeta sola) */}
      <g transform="translate(24 18)">
        {/* centre */}
        <circle r="1.5" fill={PRIMARY} opacity="0.9" />

        {/* pètals (forma geomètrica, no orgànica) */}
        <ellipse rx="4.6" ry="2.4" fill={VIOLET} opacity="0.78" transform="rotate(0)" />
        <ellipse rx="4.6" ry="2.4" fill={VIOLET} opacity="0.78" transform="rotate(72)" />
        <ellipse rx="4.6" ry="2.4" fill={VIOLET} opacity="0.78" transform="rotate(144)" />
        <ellipse rx="4.6" ry="2.4" fill={VIOLET} opacity="0.78" transform="rotate(216)" />
        <ellipse rx="4.6" ry="2.4" fill={VIOLET} opacity="0.78" transform="rotate(288)" />
      </g>
    </svg>
  );
}
