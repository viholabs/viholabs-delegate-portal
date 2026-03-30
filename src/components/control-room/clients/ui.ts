import type { CSSProperties } from "react";

export const MUTED = "var(--viho-muted, rgba(42,29,32,0.72))";
export const BORDER = "var(--viho-border, rgba(90,46,58,0.14))";
export const SURFACE = "var(--viho-surface, #fff)";
export const SOFT = "var(--viho-surface-soft, rgba(251,246,236,0.72))";
export const TEXT = "var(--viho-text, #2a1d20)";
export const ACCENT = "var(--viho-accent, #5A2E3A)";
export const GOLD = "var(--viho-gold, #C7AE6A)";
export const SUCCESS_BG = "rgba(46, 125, 50, 0.10)";
export const SUCCESS_TX = "#1b5e20";
export const ERROR_BG = "rgba(183, 28, 28, 0.10)";
export const ERROR_TX = "#8e1b1b";

export const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  lineHeight: 1.2,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: `1px solid ${BORDER}`,
};

export const tdStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 14,
  lineHeight: 1.35,
  color: TEXT,
  borderBottom: `1px solid ${BORDER}`,
};