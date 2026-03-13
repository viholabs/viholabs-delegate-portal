"use client";

import { useEffect, useMemo, useState, type SVGProps } from "react";
import WeatherModule from "@/components/portal/community/WeatherModule";

function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

type Lang = "ca" | "es" | "en" | "fr";

function normalizeLang(raw: unknown): Lang | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("ca")) return "ca";
  if (v.startsWith("es")) return "es";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("fr")) return "fr";
  return null;
}

function resolvePortalLangFallback(): Lang {
  const htmlLang =
    typeof document !== "undefined" ? document.documentElement?.lang : "";
  return normalizeLang(htmlLang) || "es";
}

function formatDatePart(now: Date, lang: Lang): string {
  const locale =
    lang === "ca"
      ? "ca-ES"
      : lang === "es"
        ? "es-ES"
        : lang === "fr"
          ? "fr-FR"
          : "en-GB";

  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
}

function formatTimePart(now: Date, lang: Lang): string {
  const locale =
    lang === "ca"
      ? "ca-ES"
      : lang === "es"
        ? "es-ES"
        : lang === "fr"
          ? "fr-FR"
          : "en-GB";

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

export default function CommunityHeaderModule() {
  const [lang, setLang] = useState<Lang>("es");
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setLang(resolvePortalLangFallback());
    setNow(new Date());
    setMounted(true);

    const id = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => window.clearInterval(id);
  }, []);

  const datePart = useMemo(() => {
    if (!now) return "";
    return formatDatePart(now, lang);
  }, [now, lang]);

  const timePart = useMemo(() => {
    if (!now) return "";
    return formatTimePart(now, lang);
  }, [now, lang]);

  return (
    <section className="w-full text-[#5A2E3A]">
      <div className="border-b border-[#D6C28A] pb-3">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-[0.24em]">
            ENTORNO VIHOLABS
          </span>
          <div className="h-px flex-1 bg-[#D6C28A]" />
        </div>

        <div className="flex flex-col gap-1 text-[14px] leading-6 text-[#6F5A63]">
          <div className="inline-flex items-center gap-2">
            <IconCalendar className="h-4 w-4 shrink-0 text-[#F26A21]" />

            {mounted && now ? (
              <span>
                {datePart} ·{" "}
                <span className="font-semibold" style={{ color: "#F26A21" }}>
                  {timePart}
                </span>
              </span>
            ) : (
              <span className="opacity-70">—</span>
            )}
          </div>

          <WeatherModule />
        </div>
      </div>
    </section>
  );
}