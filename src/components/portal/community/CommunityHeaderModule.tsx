"use client";

/**
 * CommunityHeaderModule (CANÒNIC)
 * - DateTimeBlock (colors VIHOLABS)
 * - WeatherModule (compacte + ubicació)
 * - Títol + Rail
 */

import { useEffect, useState } from "react";
import DateTimeBlock from "./DateTimeBlock";
import WeatherModule from "./WeatherModule";
import PulseRail from "./PulseRail";

export default function CommunityHeaderModule() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mb-4">
      <DateTimeBlock now={now} />

      {/* Temps petit just sota data/hora */}
      <WeatherModule />

      <div className="mt-3">
        <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-primary)" }}>
          ENTORN VIHOLABS
        </div>
        <PulseRail now={now} />
      </div>
    </div>
  );
}
