"use client";

import type { ReactNode } from "react";
import { BORDER, MUTED, SURFACE, TEXT } from "./ui";

export default function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid ${BORDER}`,
        background: SURFACE,
        borderRadius: 20,
        padding: 18,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <h3
          style={{
            margin: 0,
            color: TEXT,
            fontSize: 18,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h3>
        {subtitle ? (
          <p
            style={{
              margin: 0,
              color: MUTED,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}