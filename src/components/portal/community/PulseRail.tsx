"use client";

import { useEffect, useMemo, useState } from "react";
import { clamp } from "./utils";

export default function PulseRail({ now }: { now: Date }) {
  const GOLD = "var(--viho-gold, #C7AE6A)";
  const ORANGE = "var(--viho-orange, #FF7A2F)";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fixed = 0.52;

  const live = useMemo(() => {
    if (!mounted) return fixed;
    const minute = now.getMinutes();
    return clamp(minute / 59, 0, 1);
  }, [mounted, now]);

  return (
    <div className="mt-2">
      <div className="relative h-[12px]">
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-[6px] h-px"
          style={{
            background: `linear-gradient(to right, transparent 0%, ${GOLD} 18%, ${GOLD} 82%, transparent 100%)`,
            opacity: 0.55,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute top-[2px] h-[8px] w-[8px] rounded-full"
          style={{
            left: `calc(${(fixed * 100).toFixed(3)}% - 4px)`,
            background: GOLD,
            boxShadow: "0 0 0 2px color-mix(in srgb, var(--background) 88%, transparent)",
          }}
        />
        {mounted ? (
          <div
            aria-hidden="true"
            className="absolute top-[2px] h-[8px] w-[8px] rounded-full viho-pulse-dot"
            style={{
              left: `calc(${(live * 100).toFixed(3)}% - 4px)`,
              background: ORANGE,
              boxShadow: "0 0 0 2px color-mix(in srgb, var(--background) 88%, transparent)",
              opacity: 0.95,
            }}
          />
        ) : null}
      </div>

      <style jsx>{`
        .viho-pulse-dot {
          animation: vihoBreath 2.4s ease-in-out infinite;
        }
        @keyframes vihoBreath {
          0% {
            transform: scale(1);
            opacity: 0.88;
          }
          50% {
            transform: scale(1.14);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0.88;
          }
        }
      `}</style>
    </div>
  );
}
