"use client";

import type { ReactNode } from "react";
import TopTabsRail from "@/components/portal/TopTabsRail";

/* ✅ EXPORTAR TYPES (CLAVE DEL ERROR) */

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

export default function ShellTopBar(props: {
  tabs?: PortalShellTab[];
  header?: PortalShellHeader;
  pathname: string;
  currentTabParam: string | null;
  rightSlot?: ReactNode;
}) {
  const { tabs, header, pathname, currentTabParam, rightSlot } = props;

  const safeTabs = Array.isArray(tabs) ? tabs : [];

  if (safeTabs.length > 0) {
    return (
      <TopTabsRail
        tabs={safeTabs}
        pathname={pathname}
        currentTabParam={currentTabParam}
        rightSlot={rightSlot}
      />
    );
  }

  return (
    <div className="mb-3 px-2">
      {header?.kicker ? (
        <div
          className="truncate text-xs font-semibold tracking-wide"
          style={{ color: "var(--viho-primary)" }}
        >
          {header.kicker}
        </div>
      ) : null}

      <div className="truncate text-base font-semibold" style={{ color: "var(--viho-primary)" }}>
        {header?.title ?? "Portal"}
      </div>

      {header?.subtitle ? (
        <div className="truncate text-xs" style={{ color: "var(--viho-muted)" }}>
          {header.subtitle}
        </div>
      ) : null}

      {header?.badgeText ? (
        <span
          className="inline-block mt-2 rounded-full border px-3 py-1 text-xs"
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
  );
}
