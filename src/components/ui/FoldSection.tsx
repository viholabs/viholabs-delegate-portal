"use client";

import { useState, type ReactNode } from "react";

type FoldSectionProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function FoldSection({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
}: FoldSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      style={{
        width: "100%",
        border: "1px solid #e6dcc8",
        borderRadius: "18px",
        background: "#fbf7ef",
        overflow: "hidden",
        boxShadow: "0 1px 0 rgba(90, 46, 58, 0.03)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              lineHeight: 1.1,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#b07c4f",
              fontWeight: 700,
            }}
          >
            {title}
          </div>

          {subtitle ? (
            <div
              style={{
                fontSize: "14px",
                lineHeight: 1.35,
                color: "#6f6252",
                fontWeight: 500,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {badge ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "28px",
                padding: "0 10px",
                borderRadius: "999px",
                border: "1px solid #e2d3b5",
                background: "#f7f1e3",
                color: "#6f5332",
                fontSize: "12px",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {badge}
            </span>
          ) : null}

          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              borderRadius: "999px",
              border: "1px solid #e2d3b5",
              background: "#fffaf2",
              color: "#6f5332",
              fontSize: "14px",
              fontWeight: 700,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 160ms ease",
            }}
          >
            ▾
          </span>
        </div>
      </button>

      {open ? (
        <div
          style={{
            borderTop: "1px solid #efe4d1",
            padding: "16px 18px 18px 18px",
            background: "#fffdf8",
          }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}