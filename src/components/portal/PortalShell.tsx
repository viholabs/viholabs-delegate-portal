"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { resolveUiVariant } from "@/lib/ui/ui-variants";

export type PortalShellHeader = {
  kicker?: string | null;
  title?: string | null;
  subtitle?: string | null;
  badgeText?: string | null;
};

export type PortalShellTab = {
  href: string;
  label: string;
  hint?: string | null;
};

type PortalShellProps = {
  children: ReactNode;
  sidebar: ReactNode;
  tabs?: PortalShellTab[];
  header?: PortalShellHeader;
  rightHeaderSlot?: ReactNode;
  className?: string;
};

function isTabActive(pathname: string, href: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function PortalShell({
  children,
  sidebar,
  tabs,
  header,
  rightHeaderSlot,
  className,
}: PortalShellProps) {
  const variant = resolveUiVariant();
  const pathname = usePathname() || "";
  const safeTabs: PortalShellTab[] = Array.isArray(tabs) ? tabs : [];

  return (
    <div
      className={cn("min-h-screen w-full", className)}
      data-ui-variant={variant}
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="mx-auto flex w-full max-w-[1600px] gap-4 px-4 py-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[300px] shrink-0 lg:block">
          <div
            className="h-full rounded-2xl border backdrop-blur shadow-sm"
            style={{
              borderColor: "var(--viho-border)",
              background:
                "color-mix(in srgb, var(--viho-surface) 70%, transparent)",
            }}
          >
            {sidebar}
          </div>
        </aside>

        <main className="w-full min-w-0 flex-1">
          <div
            className="mb-4 rounded-2xl border backdrop-blur shadow-sm"
            style={{
              borderColor: "var(--viho-border)",
              background:
                "color-mix(in srgb, var(--viho-surface) 70%, transparent)",
            }}
          >
            {safeTabs.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {safeTabs.map((t) => {
                    const active = isTabActive(pathname, t.href);

                    return (
                      <Link
                        key={t.href}
                        href={t.href}
                        className={cn(
                          "group rounded-2xl border px-3 py-2",
                          active ? "" : "hover:bg-[color:var(--viho-surface-2)]"
                        )}
                        style={{
                          borderColor: "var(--viho-border)",
                          background: active
                            ? "var(--viho-surface)"
                            : "transparent",
                        }}
                      >
                        <div
                          className="text-xs font-semibold tracking-wide"
                          style={{
                            color: active
                              ? "var(--viho-primary)"
                              : "var(--viho-text)",
                          }}
                        >
                          {t.label}
                        </div>

                        {t.hint ? (
                          <div
                            className="text-[11px]"
                            style={{ color: "var(--viho-muted)" }}
                          >
                            {t.hint}
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">{rightHeaderSlot}</div>
              </div>
            ) : (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {header?.kicker ? (
                      <div
                        className="truncate text-xs font-semibold tracking-wide"
                        style={{ color: "var(--viho-primary)" }}
                      >
                        {header.kicker}
                      </div>
                    ) : null}

                    <div
                      className="truncate text-base font-semibold"
                      style={{ color: "var(--viho-primary)" }}
                    >
                      {header?.title ?? "Portal"}
                    </div>

                    {header?.subtitle ? (
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--viho-muted)" }}
                      >
                        {header.subtitle}
                      </div>
                    ) : null}
                  </div>

                  {header?.badgeText ? (
                    <span
                      className="rounded-full border px-3 py-1 text-xs"
                      style={{
                        borderColor: "var(--viho-border)",
                        background: "var(--viho-surface)",
                        color: "var(--viho-primary)",
                      }}
                    >
                      {header.badgeText}
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}