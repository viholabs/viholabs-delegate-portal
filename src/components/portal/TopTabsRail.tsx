"use client";

import { cn } from "@/lib/utils";

export type ShellTabId =
  | "situation"
  | "clients"
  | "facturacion"
  | "recursos"
  | "el-elyon";

export type ShellTab = {
  id: ShellTabId;
  label: string;
  hidden?: boolean;
};

type TopTabsRailProps = {
  tabs: ShellTab[];
  activeTab: ShellTabId;
  onChange: (tabId: ShellTabId) => void;
};

export default function TopTabsRail({
  tabs,
  activeTab,
  onChange,
}: TopTabsRailProps) {
  const safeTabs = Array.isArray(tabs)
    ? tabs.filter((tab) => !tab.hidden)
    : [];

  return (
    <div
      className="w-full rounded-2xl border px-3 py-3"
      style={{
        borderColor: "var(--viho-border)",
        background: "var(--viho-surface)",
      }}
    >
      <div className="flex flex-wrap gap-2">
        {safeTabs.map((tab) => {
          const active = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                active ? "" : "hover:opacity-90"
              )}
              style={{
                borderColor: "var(--viho-border)",
                background: active ? "var(--viho-surface-2)" : "transparent",
                color: active ? "var(--viho-primary)" : "var(--viho-text)",
              }}
              aria-pressed={active}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}