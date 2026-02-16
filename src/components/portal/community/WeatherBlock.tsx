"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  tempC: number;
  code: number;
};

type Category =
  | "clear"
  | "cloudy"
  | "rúfol"
  | "rain"
  | "heavy_rain"
  | "snow"
  | "storm"
  | "heat"
  | "strong_heat"
  | "cold"
  | "strong_cold"
  | "variable";

function categoryFrom(tempC: number, code: number): Category {
  if (tempC >= 30) return "strong_heat";
  if (tempC >= 24) return "heat";
  if (tempC <= 2) return "strong_cold";
  if (tempC <= 10) return "cold";

  if (code === 0) return "clear";
  if (code === 1 || code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "rúfol";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  if (code >= 80 && code <= 82) return "heavy_rain";
  if ((code >= 61 && code <= 67) || (code >= 51 && code <= 57)) return "rain";

  return "variable";
}

function isNightLocal(): boolean {
  const h = new Date().getHours();
  return h < 7 || h >= 20;
}

function WeatherIcon({ cat, night }: { cat: Category; night: boolean }) {
  const cls = "h-8 w-8 shrink-0";
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (cat === "clear") {
    return night ? (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M21 13.2A7.5 7.5 0 0 1 10.8 3a6.5 6.5 0 1 0 10.2 10.2Z" />
      </svg>
    ) : (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="12" r="4.2" />
        <path
          {...common}
          d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M4.3 4.3l1.7 1.7M18 18l1.7 1.7M19.7 4.3 18 6M6 18l-1.7 1.7"
        />
      </svg>
    );
  }

  if (cat === "cloudy" || cat === "rúfol") {
    return (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        {night ? <path {...common} d="M19.5 9.2A5 5 0 0 1 13 4.1a4.3 4.3 0 0 0 6.5 5.1Z" /> : null}
        <path
          {...common}
          d="M7.5 18.2h10.2a4 4 0 0 0 .4-8 5.8 5.8 0 0 0-11.2 1.6A3.5 3.5 0 0 0 7.5 18.2Z"
        />
        {cat === "rúfol" ? <path {...common} d="M4 20h16M6 22h12" /> : null}
      </svg>
    );
  }

  if (cat === "rain" || cat === "heavy_rain") {
    return (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <path
          {...common}
          d="M7.2 15.6h10.2a4 4 0 0 0 .4-8 5.8 5.8 0 0 0-11.2 1.6A3.5 3.5 0 0 0 7.2 15.6Z"
        />
        <path
          {...common}
          d={
            cat === "heavy_rain"
              ? "M8 18l-1 3M12 18l-1 3M16 18l-1 3"
              : "M10 18l-1 3M14 18l-1 3"
          }
        />
      </svg>
    );
  }

  if (cat === "snow") {
    return (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <path
          {...common}
          d="M7.2 14.8h10.2a4 4 0 0 0 .4-8 5.8 5.8 0 0 0-11.2 1.6A3.5 3.5 0 0 0 7.2 14.8Z"
        />
        <path {...common} d="M12 16v6M9 18h6M10.2 19.8l3.6-3.6M13.8 19.8l-3.6-3.6" />
      </svg>
    );
  }

  if (cat === "storm") {
    return (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <path
          {...common}
          d="M7.2 14.8h10.2a4 4 0 0 0 .4-8 5.8 5.8 0 0 0-11.2 1.6A3.5 3.5 0 0 0 7.2 14.8Z"
        />
        <path {...common} d="M12 15l-2 4h3l-2 4" />
      </svg>
    );
  }

  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d="M3 10h10c2 0 3-1 3-2s-1-2-2-2" />
      <path {...common} d="M3 14h14c2 0 3 1 3 2s-1 2-2 2" />
      <path {...common} d="M3 18h9" />
    </svg>
  );
}

export default function WeatherBlock(props: Props) {
  const { tempC, code } = props;

  const cat = useMemo(() => categoryFrom(tempC, code), [tempC, code]);
  const night = useMemo(() => isNightLocal(), []);

  const [phrase, setPhrase] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("loading");

      const key = `viho_weather_last_phrase_${cat}`;
      const last = (() => {
        try {
          return window.sessionStorage.getItem(key) || "";
        } catch {
          return "";
        }
      })();

      try {
        const url = new URL("/api/community/weather-phrase", window.location.origin);
        url.searchParams.set("category", cat);
        if (last) url.searchParams.set("exclude", last);

        const res = await fetch(url.toString(), {
          method: "GET",
          credentials: "include",
          headers: { accept: "application/json" },
        });

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        const raw = await res.text();

        // Si no és JSON, és que ens han donat HTML (signin) o similar → ho tractem com error controlat
        if (!contentType.includes("application/json")) throw new Error("non_json_response");

        const j = JSON.parse(raw);

        if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);

        const p = String(j.phrase || "").trim();
        if (!p) throw new Error("empty_phrase");

        if (cancelled) return;

        setPhrase(p);
        setStatus("ok");
        try {
          window.sessionStorage.setItem(key, p);
        } catch {}
      } catch {
        if (cancelled) return;
        setPhrase("hoy el tiempo no se deja decir.");
        setStatus("error");
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [cat]);

  const line = status === "loading" || status === "idle" ? "mirando por la ventana…" : phrase;

  return (
    <div className="mt-4" style={{ color: "var(--viho-text)" }}>
      <div className="flex items-center gap-2 text-3xl leading-none">
        <WeatherIcon cat={cat} night={night} />
        <span className="font-medium">{Math.round(tempC)}°</span>
        <span className="text-base opacity-70">{line}</span>
      </div>
    </div>
  );
}
