"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type PortalShellTab = {
  href: string;
  label: string;
  hint?: string | null;
};

function safeParseHref(href: string) {
  try {
    return new URL(href, "http://local.viho");
  } catch {
    return null;
  }
}

function isTabActive(params: {
  pathname: string;
  currentTabParam: string | null;
  href: string;
}) {
  const { pathname, currentTabParam, href } = params;
  if (!href) return false;

  const u = safeParseHref(href);
  if (!u) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const hrefPath = u.pathname;
  const hrefTab = u.searchParams.get("tab");

  if (hrefTab) {
    if (pathname !== hrefPath) return false;
    return (currentTabParam || "") === hrefTab;
  }

  if (hrefPath === "/") return pathname === "/";
  return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
}

export default function TopTabsRail(props: {
  tabs: PortalShellTab[];
  pathname: string;
  currentTabParam: string | null;
  rightSlot?: React.ReactNode;
}) {
  const { tabs, pathname, currentTabParam, rightSlot } = props;

  const GOLD = "var(--viho-gold, #C7AE6A)";

  const stripRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Active indicators
  const [dotX, setDotX] = useState<number>(20);
  const [underlineX, setUnderlineX] = useState<number>(0);
  const [underlineW, setUnderlineW] = useState<number>(0);

  // Cursor dot (hover)
  const [cursorDotX, setCursorDotX] = useState<number | null>(null);

  // Overflow state
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [scrub, setScrub] = useState(0);

  // Drag state (robust: window listeners, no pointer-capture)
  const DRAG_THRESHOLD_PX = 6;
  const JUST_DRAGGED_MS = 260;

  const drag = useRef<{
    down: boolean;
    dragging: boolean;
    startX: number;
    startScrollLeft: number;
    pointerId: number | null;
  }>({ down: false, dragging: false, startX: 0, startScrollLeft: 0, pointerId: null });

  const justDraggedUntilTs = useRef<number>(0);

  const activeKey = useMemo(
    () => `${pathname}__${currentTabParam || ""}__${tabs.length}`,
    [pathname, currentTabParam, tabs.length]
  );

  function getActiveIndex(): number {
    for (let i = 0; i < tabs.length; i++) {
      if (isTabActive({ pathname, currentTabParam, href: tabs[i].href })) return i;
    }
    return -1;
  }

  function recalcOverflow() {
    const sc = scrollRef.current;
    if (!sc) return;

    const max = sc.scrollWidth - sc.clientWidth;
    const overflow = max > 2;
    setHasOverflow(overflow);

    if (!overflow) {
      setCanLeft(false);
      setCanRight(false);
      setScrub(0);
      return;
    }

    const left = sc.scrollLeft;
    setCanLeft(left > 2);
    setCanRight(left < max - 2);
    setScrub(max > 0 ? left / max : 0);
  }

  function recalcIndicator() {
    const strip = stripRef.current;
    const sc = scrollRef.current;
    if (!strip || !sc) return;

    const idx = getActiveIndex();
    if (idx < 0) return;

    const el = sc.querySelector<HTMLAnchorElement>(`a[data-tab-index="${idx}"]`);
    if (!el) return;

    const leftViewport = el.offsetLeft - sc.scrollLeft;
    const width = el.offsetWidth;
    const centerViewport = leftViewport + width / 2;

    const pad = 8;
    const maxX = Math.max(pad, strip.clientWidth - pad);

    setDotX(Math.min(maxX, Math.max(pad, centerViewport)));
    setUnderlineX(Math.max(0, leftViewport));
    setUnderlineW(Math.max(0, width));
  }

  function recalcAll() {
    recalcOverflow();
    recalcIndicator();
  }

  useEffect(() => {
    requestAnimationFrame(() => {
      recalcAll();
      requestAnimationFrame(() => recalcAll());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    const onResize = () => recalcAll();
    window.addEventListener("resize", onResize);

    const ro = new ResizeObserver(() => recalcAll());
    if (stripRef.current) ro.observe(stripRef.current);
    if (scrollRef.current) ro.observe(scrollRef.current);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    recalcAll();
  }

  function clampCursorDotFromClientX(clientX: number) {
    const strip = stripRef.current;
    if (!strip) return;

    const r = strip.getBoundingClientRect();
    const x = clientX - r.left;

    const pad = 8;
    const maxX = Math.max(pad, strip.clientWidth - pad);
    const clamped = Math.min(maxX, Math.max(pad, x));
    setCursorDotX(clamped);
  }

  function endDrag() {
    const sc = scrollRef.current;

    if (drag.current.dragging) {
      justDraggedUntilTs.current = Date.now() + JUST_DRAGGED_MS;
    }

    drag.current.down = false;
    drag.current.dragging = false;
    drag.current.pointerId = null;

    if (sc) delete sc.dataset.dragging;

    requestAnimationFrame(() => recalcAll());
  }

  function onWindowPointerMove(e: PointerEvent) {
    const sc = scrollRef.current;
    if (!sc) return;
    if (!drag.current.down) return;

    clampCursorDotFromClientX(e.clientX);

    const dx = e.clientX - drag.current.startX;

    if (!drag.current.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.current.dragging = true;
      sc.dataset.dragging = "1";
    }

    // drag scroll
    sc.scrollLeft = drag.current.startScrollLeft - dx;
    recalcAll();
  }

  function onWindowPointerUp(e: PointerEvent) {
    if (!drag.current.down) return;
    if (drag.current.pointerId != null && e.pointerId !== drag.current.pointerId) return;
    endDrag();
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp, true);
    window.removeEventListener("pointercancel", onWindowPointerUp, true);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const sc = scrollRef.current;
    if (!sc) return;
    if (e.button !== 0) return;

    // hover dot immediately
    clampCursorDotFromClientX(e.clientX);

    drag.current.down = true;
    drag.current.dragging = false;
    drag.current.startX = e.clientX;
    drag.current.startScrollLeft = sc.scrollLeft;
    drag.current.pointerId = e.pointerId;

    // global listeners (robust in Edge)
    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    window.addEventListener("pointerup", onWindowPointerUp, true);
    window.addEventListener("pointercancel", onWindowPointerUp, true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // hover dot (even without drag)
    clampCursorDotFromClientX(e.clientX);
  }

  function onPointerLeave() {
    if (!drag.current.down) setCursorDotX(null);
  }

  function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // If a real drag happened just before, block ghost click.
    if (Date.now() < justDraggedUntilTs.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return (
    <div className="mb-3 px-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div ref={stripRef} className="relative">
            {/* Fades + hairline overflow */}
            {hasOverflow ? (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 h-full w-16"
                  style={{
                    opacity: canLeft ? 1 : 0.35,
                    transition: "opacity 180ms ease",
                    background:
                      "linear-gradient(to right, color-mix(in srgb, var(--background) 98%, transparent), transparent)",
                  }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 top-0 h-full w-16"
                  style={{
                    opacity: canRight ? 1 : 0.35,
                    transition: "opacity 180ms ease",
                    background:
                      "linear-gradient(to left, color-mix(in srgb, var(--background) 98%, transparent), transparent)",
                  }}
                />
                {canRight ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-2 bottom-2 w-px"
                    style={{ background: GOLD, opacity: 0.65 }}
                  />
                ) : null}
                {canLeft ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 top-2 bottom-2 w-px"
                    style={{
                      background: "color-mix(in srgb, var(--viho-muted) 65%, transparent)",
                      opacity: 0.6,
                    }}
                  />
                ) : null}
              </>
            ) : null}

            <div
              ref={scrollRef}
              className="viho-tabs-scroll flex items-center gap-10 overflow-x-auto overflow-y-hidden py-1"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                cursor: hasOverflow ? "grab" : "default",
                userSelect: "none",
              }}
              onScroll={onScroll}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerLeave={onPointerLeave}
            >
              {tabs.map((t, i) => {
                const active = isTabActive({ pathname, currentTabParam, href: t.href });

                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    data-tab-index={i}
                    onClick={onLinkClick}
                    className="relative inline-flex h-12 items-center whitespace-nowrap select-none"
                    style={{
                      color: active
                        ? "var(--viho-primary)"
                        : "color-mix(in srgb, var(--viho-text) 70%, transparent)",
                      letterSpacing: "0.11em",
                      textTransform: "uppercase",
                      fontSize: "12px",
                      transition: "color 220ms ease, opacity 220ms ease",
                      opacity: active ? 1 : 0.86,
                    }}
                  >
                    <span className="relative">{t.label}</span>
                    {t.hint ? <span className="sr-only">{t.hint}</span> : null}
                  </Link>
                );
              })}
            </div>

            {/* Baseline */}
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0 h-px"
              style={{ background: "color-mix(in srgb, var(--viho-border) 78%, transparent)" }}
            />

            {/* Gold line */}
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: "1px",
                background: `linear-gradient(to right, transparent 0%, var(--viho-gold, #C7AE6A) 18%, var(--viho-gold, #C7AE6A) 82%, transparent 100%)`,
                opacity: 0.5,
              }}
            />

            {/* Underline active */}
            <div
              aria-hidden="true"
              className="absolute -bottom-[1px] h-px"
              style={{
                left: underlineX,
                width: underlineW,
                background: GOLD,
                opacity: 0.9,
                transition: "left 180ms ease, width 180ms ease",
              }}
            />

            {/* Dot active (fixed) */}
            <div
              aria-hidden="true"
              className="absolute -bottom-[4px] h-[7px] w-[7px] rounded-full"
              style={{
                left: dotX - 3.5,
                background: GOLD,
                boxShadow: "0 0 0 2px color-mix(in srgb, var(--background) 88%, transparent)",
                transition: "left 180ms ease",
              }}
            />

            {/* Dot cursor (hover) */}
            {cursorDotX != null ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-[4px] h-[7px] w-[7px] rounded-full"
                style={{
                  left: cursorDotX - 3.5,
                  background: "var(--viho-orange, #FF7A2F)",
                  boxShadow: "0 0 0 2px color-mix(in srgb, var(--background) 88%, transparent)",
                  transition: drag.current.down ? "none" : "left 60ms linear",
                  opacity: 0.95,
                }}
              />
            ) : null}

            {/* Scrubber */}
            {hasOverflow ? (
              <>
                <div
                  aria-hidden="true"
                  className="absolute -bottom-[13px] left-0 right-0 h-px"
                  style={{
                    background: "color-mix(in srgb, var(--viho-border) 55%, transparent)",
                    opacity: 0.65,
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -bottom-[16px] h-[6px] w-[6px] rounded-full"
                  style={{
                    left: `calc(${(scrub * 100).toFixed(4)}% - 3px)`,
                    background: "color-mix(in srgb, var(--viho-muted) 75%, transparent)",
                    transition: "left 80ms linear",
                  }}
                />
              </>
            ) : null}

            <style jsx>{`
              .viho-tabs-scroll::-webkit-scrollbar {
                display: none;
              }
              .viho-tabs-scroll[data-dragging="1"] {
                cursor: grabbing !important;
              }
            `}</style>
          </div>
        </div>

        <div className="flex items-center gap-2">{rightSlot}</div>
      </div>
    </div>
  );
}
