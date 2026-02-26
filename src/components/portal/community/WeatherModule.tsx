"use client";

/**
 * WeatherModule — CANÒNIC
 * - Geolocalització usuari (navigator.geolocation)
 * - Cache coords (localStorage)
 * - Fallback Barcelona (mai Madrid)
 * - Weather via Open-Meteo
 * - Ubicació (ciutat) via Nominatim reverse (best effort)
 */

import { useEffect, useState } from "react";
import WeatherBlock from "./WeatherBlock";

type WeatherState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; tempC: number; code: number; locationLabel: string | null }
  | { status: "error"; message: string };

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

async function reverseCityLabel(lat: number, lon: number): Promise<string | null> {
  // Best-effort: Nominatim reverse (pot fallar; mai trenquem UI)
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}` +
      `&zoom=10&addressdetails=1&accept-language=ca`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const a = j?.address || {};
    const city =
      String(a.city || a.town || a.village || a.municipality || a.county || "").trim() || null;
    if (!city) return null;
    return city;
  } catch {
    return null;
  }
}

export default function WeatherModule() {
  const [weather, setWeather] = useState<WeatherState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function apply(lat: number, lon: number, fallbackLabel: string | null) {
      const w = await fetchWeather(lat, lon);
      const label = (await reverseCityLabel(lat, lon)) || fallbackLabel;
      if (!cancelled) setWeather({ status: "ok", ...w, locationLabel: label });
    }

    async function run() {
      try {
        setWeather({ status: "loading" });

        // 1) cache (instant)
        const cached = typeof window !== "undefined" ? getCachedCoords() : null;
        if (cached) {
          // best effort: no bloquegem
          void apply(cached.lat, cached.lon, null);
        }

        // 2) geoloc real (si l'usuari ho permet)
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
        await apply(coords.lat, coords.lon, null);
      } catch {
        // 3) fallback CANÒNIC: Barcelona (mai Madrid)
        try {
          await apply(41.3874, 2.1686, "Barcelona");
        } catch {
          if (!cancelled) setWeather({ status: "error", message: "weather error" });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (weather.status === "loading" || weather.status === "idle") {
    return (
      <div className="mt-2 text-[12px]" style={{ color: "var(--viho-muted)" }}>
        mirando por la ventana…
      </div>
    );
  }

  if (weather.status === "ok") {
    return (
      <WeatherBlock
        tempC={weather.tempC}
        code={weather.code}
        variant="compact"
        locationLabel={weather.locationLabel || "Ubicació no disponible"}
      />
    );
  }

  return (
    <div className="mt-2 text-[12px]" style={{ color: "var(--viho-muted)" }}>
      avui el temps no es deixa dir.
    </div>
  );
}
