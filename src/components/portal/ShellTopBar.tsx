"use client";

import TopTabsRail, {
  type ShellTab,
  type ShellTabId,
} from "@/components/portal/TopTabsRail";
import type { PortalShellHeader, PortalShellTab } from "@/components/portal/PortalShell";

type ShellTopBarProps = {
  tabs?: PortalShellTab[];
  header?: PortalShellHeader;
  activeHref?: string;
  onTabChange?: (tabId: ShellTabId) => void;
};

function hrefToTabId(href: string): ShellTabId | null {
  if (
    href === "/control-room/shell" ||
    href === "/control-room/shell?tab=situation" ||
    href === "/situation"
  ) {
    return "situation";
  }

  if (href.includes("tab=clients") || href === "/clients") {
    return "clients";
  }

  if (href.includes("tab=facturacion") || href === "/facturacion") {
    return "facturacion";
  }

  if (href.includes("tab=recursos") || href === "/recursos") {
    return "recursos";
  }

  if (href.includes("tab=el-elyon") || href === "/el-elyon") {
    return "el-elyon";
  }

  return null;
}

function resolveActiveTab(
  tabs: ShellTab[],
  activeHref?: string
): ShellTabId {
  const fromHref = activeHref ? hrefToTabId(activeHref) : null;

  if (fromHref && tabs.some((tab) => tab.id === fromHref)) {
    return fromHref;
  }

  return tabs[0]?.id ?? "situation";
}

export default function ShellTopBar({
  tabs,
  header,
  activeHref,
  onTabChange,
}: ShellTopBarProps) {
  const safeTabs: ShellTab[] = Array.isArray(tabs)
    ? tabs
        .map((tab) => {
          const id = hrefToTabId(tab.href);
          if (!id) return null;

          return {
            id,
            label: tab.label,
          } satisfies ShellTab;
        })
        .filter((tab): tab is ShellTab => tab !== null)
    : [];

  const activeTab = resolveActiveTab(safeTabs, activeHref);

  return (
    <div className="space-y-3">
      {header ? (
        <div
          className="rounded-2xl border px-4 py-3"
          style={{
            borderColor: "var(--viho-border)",
            background: "var(--viho-surface)",
          }}
        >
          {header.kicker ? (
            <div
              className="text-xs font-semibold tracking-wide"
              style={{ color: "var(--viho-primary)" }}
            >
              {header.kicker}
            </div>
          ) : null}

          {header.title ? (
            <div
              className="text-base font-semibold"
              style={{ color: "var(--viho-primary)" }}
            >
              {header.title}
            </div>
          ) : null}

          {header.subtitle ? (
            <div
              className="text-sm"
              style={{ color: "var(--viho-muted)" }}
            >
              {header.subtitle}
            </div>
          ) : null}
        </div>
      ) : null}

      {safeTabs.length > 0 ? (
        <TopTabsRail
          tabs={safeTabs}
          activeTab={activeTab}
          onChange={(tabId) => onTabChange?.(tabId)}
        />
      ) : null}
    </div>
  );
}