"use client";

/**
 * VIHOLABS — PortalShell (CANONICAL · SINGLE SHELL)
 * - 1 sola pell per a tot el portal (Side Hall + Header + Main)
 * - El rol canvia nav/dades/accions, NO l'estructura
 * - UI variants només via tokens (data-ui-variant)
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { resolveUiVariant } from "@/lib/ui/ui-variants";

export type PortalShellHeader = {
  kicker?: string | null;
  title?: string | null;
  subtitle?: string | null;
  badgeText?: string | null;
};

export default function PortalShell(props: {
  children: ReactNode;
  sidebar: ReactNode;
  header?: PortalShellHeader;
  className?: string;
}) {
  const { children, sidebar, header, className } = props;

  const variant = resolveUiVariant();

  return (
    <div
      className={cn("min-h-screen w-full", className)}
      data-ui-variant={variant}
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="mx-auto flex w-full max-w-[1600px] gap-4 px-4 py-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[280px] shrink-0 lg:block">
          <div
            className="h-full rounded-2xl border backdrop-blur shadow-sm"
            style={{
              borderColor: "var(--viho-border)",
              background: "color-mix(in srgb, var(--viho-surface) 70%, transparent)",
            }}
          >
            {sidebar}
          </div>
        </aside>

        <main className="w-full flex-1 min-w-0">
          <div
            className="mb-4 rounded-2xl border backdrop-blur shadow-sm"
            style={{
              borderColor: "var(--viho-border)",
              background: "color-mix(in srgb, var(--viho-surface) 70%, transparent)",
            }}
          >
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
                    <div className="truncate text-xs" style={{ color: "var(--viho-muted)" }}>
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
          </div>

          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
