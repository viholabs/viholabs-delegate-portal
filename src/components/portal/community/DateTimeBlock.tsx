"use client";

import { useEffect, useState } from "react";

type Props = { now: Date };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatParts(now: Date) {
  try {
    const loc = "ca-ES";
    const date = now.toLocaleDateString(loc, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const time = now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    return { date, time };
  } catch {
    const date = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
    const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    return { date, time };
  }
}

export default function DateTimeBlock({ now }: Props) {
  // CANÒNIC: evitar hydration mismatch (SSR vs client timezone)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Placeholder estable: mai mismatch
    return (
      <div className="text-[13px] leading-snug" style={{ color: "var(--viho-muted)" }}>
        —
      </div>
    );
  }

  const { date, time } = formatParts(now);

  return (
    <div className="text-[13px] leading-snug">
      <span style={{ color: "var(--viho-primary)" }}>{date}</span>
      <span style={{ color: "var(--viho-muted)" }}> · </span>
      <span style={{ color: "var(--viho-gold, #C7AE6A)", fontWeight: 600 }}>{time}</span>
    </div>
  );
}
