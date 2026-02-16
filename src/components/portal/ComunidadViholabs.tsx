"use client";

/**
 * VIHOLABS — Comunidad Viholabs (Side Hall) — Modular (CANÓNICO)
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import IdentityBlock from "./community/IdentityBlock";
import WeatherBlock from "./community/WeatherBlock";

type WeatherState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; tempC: number; code: number }
  | { status: "error"; message: string };

type CommunityModule = {
  id: string;
  render: () => ReactNode;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function PulseRail({ now }: { now: Date }) {
  const GOLD = "var(--viho-gold, #C7AE6A)";
  const ORANGE = "var(--viho-orange, #FF7A2F)";

  const fixed = 0.52;
  const live = useMemo(() => clamp(now.getMinutes() / 59, 0, 1), [now]);

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
          }}
        />
        <div
          aria-hidden="true"
          className="absolute top-[2px] h-[8px] w-[8px] rounded-full"
          style={{
            left: `calc(${(live * 100).toFixed(3)}% - 4px)`,
            background: ORANGE,
            opacity: 0.95,
          }}
        />
      </div>
    </div>
  );
}

function getCachedCoords(): { lat: number; lon: number } | null {
  try {
    const raw = window.localStorage.getItem("viho_weather_coords_v1");
    if (!raw) return null;
    const j = JSON.parse(raw);
    const lat = Number(j?.lat);
    const lon = Number(j?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

function cacheCoords(lat: number, lon: number) {
  try {
    window.localStorage.setItem("viho_weather_coords_v1", JSON.stringify({ lat, lon }));
  } catch {}
}

export default function ComunidadViholabs() {
  const [now, setNow] = useState<Date>(() => new Date());
  const [weather, setWeather] = useState<WeatherState>({ status: "idle" });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather(lat: number, lon: number) {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${encodeURIComponent(String(lat))}` +
        `&longitude=${encodeURIComponent(String(lon))}` +
        `&current=temperature_2m,weather_code`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);

      const j = await res.json();
      const temp = Number(j?.current?.temperature_2m);
      const code = Number(j?.current?.weather_code);
      if (!Number.isFinite(temp) || !Number.isFinite(code)) throw new Error("Weather payload inválido");

      return { tempC: temp, code };
    }

    async function run() {
      try {
        setWeather({ status: "loading" });

        // 1) intent: coords cachejades (instant)
        const cached = typeof window !== "undefined" ? getCachedCoords() : null;
        if (cached) {
          const r = await fetchWeather(cached.lat, cached.lon);
          if (!cancelled) setWeather({ status: "ok", ...r });
          // seguim intentant geoloc per actualitzar si cal (en background)
        }

        // 2) intent: geolocalització real
        const coords = await new Promise<{ lat: number; lon: number }>((resolve, reject) => {
          if (typeof navigator === "undefined" || !navigator.geolocation) {
            reject(new Error("geolocation_unavailable"));
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            (err) => reject(new Error(err?.message || "geolocation_denied")),
            { enableHighAccuracy: false, timeout: 4000, maximumAge: 10 * 60 * 1000 }
          );
        });

        cacheCoords(coords.lat, coords.lon);

        const r = await fetchWeather(coords.lat, coords.lon);
        if (!cancelled) setWeather({ status: "ok", ...r });
      } catch (e) {
        // 3) fallback: Madrid (si no hi ha res)
        try {
          const r = await fetchWeather(40.4168, -3.7038);
          if (!cancelled) setWeather({ status: "ok", ...r });
        } catch {
          if (!cancelled) setWeather({ status: "error", message: e instanceof Error ? e.message : "weather error" });
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const modules: CommunityModule[] = useMemo(
    () => [
      { id: "identity", render: () => <IdentityBlock /> },
      {
        id: "weather",
        render: () =>
          weather.status === "ok" ? (
            <WeatherBlock tempC={weather.tempC} code={weather.code} />
          ) : weather.status === "loading" || weather.status === "idle" ? (
            <div className="mt-4 text-sm" style={{ color: "var(--viho-muted)" }}>
              mirando por la ventana…
            </div>
          ) : (
            <div className="mt-4 text-sm" style={{ color: "var(--viho-muted)" }}>
              hoy el tiempo no se deja decir.
            </div>
          ),
      },
    ],
    [weather]
  );

  return (
    <div className="h-full px-4 py-4">
      <div className="mb-4">
        <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-primary)" }}>
          COMUNIDAD VIHOLABS
        </div>
        <PulseRail now={now} />
      </div>

      {modules.map((m) => (
        <div key={m.id}>{m.render()}</div>
      ))}
    </div>
  );
}
