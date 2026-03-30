"use client";

import { BORDER, MUTED, SURFACE, TEXT } from "./ui";
import { compact } from "./utils";

export function FieldLabel({ children }: { children: string }) {
  return (
    <label
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: MUTED,
      }}
    >
      {children}
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          minWidth: 0,
          border: `1px solid ${BORDER}`,
          background: SURFACE,
          color: TEXT,
          borderRadius: 12,
          padding: "12px 14px",
          outline: "none",
          fontSize: 14,
        }}
      />
    </div>
  );
}

export function DetailValue({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        background: SURFACE,
      }}
    >
      <FieldLabel>{label}</FieldLabel>
      <div style={{ color: TEXT, fontSize: 14, lineHeight: 1.35 }}>
        {compact(value)}
      </div>
    </div>
  );
}