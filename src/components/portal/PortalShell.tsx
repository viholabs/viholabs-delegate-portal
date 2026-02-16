"use client";

/**
 * VIHOLABS — PortalShell (CANONICAL · SINGLE SHELL)
 * (Layout estable. Detalles en bloques.)
 */

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { resolveUiVariant } from "@/lib/ui/ui-variants";
import ShellTopBar from "@/components/portal/ShellTopBar";
import type { PortalShellTab, PortalShellHeader } from "@/components/portal/ShellTopBar";

export type { PortalShellHeader, PortalShellTab };

export default function PortalShell(props: {
  children: ReactNode;
  sidebar: ReactNode;
  tabs?: PortalShellTab[];
  header?: PortalShellHeader;
  rightHeaderSlot?: ReactNode;
  className?: string;
}) {
  const { children, sidebar, tabs, header, rightHeaderSlot, className } = props;

  const variant = resolveUiVariant();
  const pathname = usePathname() || "";
  const sp = useSearchParams();
  const currentTabParam = sp?.get("tab") || null;

  return (
    <div
      className={cn("min-h-screen w-full", className)}
      data-ui-variant={variant}
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="mx-auto flex w-full max-w-[1600px] gap-4 px-4 py-4">
        {/* Side Hall (Carnegie Bar) — sempre visible */}
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[300px] shrink-0 lg:block">
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

        {/* Main */}
        <main className="w-full flex-1 min-w-0">
          <ShellTopBar
            tabs={tabs}
            header={header}
            pathname={pathname}
            currentTabParam={currentTabParam}
            rightSlot={rightHeaderSlot}
          />

          {/* Centre */}
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
