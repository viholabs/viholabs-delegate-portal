"use client";

import { useState, type ReactNode } from "react";

export type ModuleStatus = "ok" | "warning" | "critical" | "loading" | "empty";

export function statusColor(s: ModuleStatus) {
  if (s === "critical") return "#b91c1c";
  if (s === "warning") return "#92400e";
  if (s === "ok") return "#065f46";
  if (s === "empty") return "#6b7280";
  return "#1e40af";
}

export function StatusDot({ status }: { status: ModuleStatus }) {
  const color = statusColor(status);
  return (
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
  );
}

export function StatusBadge({ status, label }: { status: ModuleStatus; label?: string }) {
  const color = statusColor(status);
  const bg = status === "critical" ? "rgba(185,28,28,0.1)" : status === "warning" ? "rgba(146,64,14,0.1)" : status === "ok" ? "rgba(6,95,70,0.1)" : "rgba(107,114,128,0.1)";
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 6, background: bg, color, border: `1px solid ${color}30` }}>
      {label ?? status}
    </span>
  );
}

export function KpiChip({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 10px", borderRadius: 10, background: warn ? "rgba(146,64,14,0.07)" : "rgba(255,255,255,0.6)", border: `1px solid ${warn ? "rgba(146,64,14,0.2)" : "rgba(0,0,0,0.07)"}` }}>
      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: warn ? "#92400e" : "inherit" }}>{value}</span>
      <span style={{ fontSize: 10, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      {sub && <span style={{ fontSize: 10, opacity: 0.55 }}>{sub}</span>}
    </div>
  );
}

export function Subcard({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.5)" }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left" }}
      >
        <span>{title}</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: "0 12px 12px" }}>{children}</div>}
    </div>
  );
}

export default function ElElyonModuleCard({
  icon,
  title,
  subtitle,
  status,
  kpis,
  children,
  defaultOpen = false,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  status: ModuleStatus;
  kpis?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const borderColor = status === "critical" ? "rgba(185,28,28,0.3)" : status === "warning" ? "rgba(146,64,14,0.25)" : "rgba(199,174,106,0.28)";

  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: 16, background: "rgba(251,246,236,0.82)", overflow: "hidden" }}>
      {/* Card header */}
      <div
        style={{ padding: "12px 16px", cursor: "pointer", userSelect: "none" }}
        onClick={() => setOpen((p) => !p)}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#3d2b1f" }}>{title}</div>
              {subtitle && <div style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>{subtitle}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <StatusBadge status={status} />
            <span style={{ fontSize: 11, opacity: 0.5 }}>{open ? "▲" : "▼"}</span>
          </div>
        </div>
        {kpis && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {kpis}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {open && children && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}
