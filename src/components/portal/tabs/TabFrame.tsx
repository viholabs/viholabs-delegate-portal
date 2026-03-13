"use client";

import type { ReactNode } from "react";

type TabSlotProps = {
  children: ReactNode;
};

type TabFrameComponent = ((props: TabSlotProps) => ReactNode) & {
  Dominant?: typeof TabDominant;
  Secondary?: typeof TabSecondary;
  Residual?: typeof TabResidual;
};

function sectionClassName(extra?: string) {
  return [
    "w-full min-w-0",
    "rounded-[28px]",
    "border border-[#D6C28A]",
    "bg-[#FBF6EC]",
    "p-0",
    "shadow-none",
    extra ?? "",
  ]
    .join(" ")
    .trim();
}

export function TabFrame({ children }: TabSlotProps) {
  return <div className="flex w-full min-w-0 flex-col gap-6">{children}</div>;
}

export function TabDominant({ children }: TabSlotProps) {
  return <section className={sectionClassName()}>{children}</section>;
}

export function TabSecondary({ children }: TabSlotProps) {
  return <section className={sectionClassName()}>{children}</section>;
}

export function TabResidual({ children }: TabSlotProps) {
  return <section className={sectionClassName()}>{children}</section>;
}

const TabFrameNamespace = TabFrame as TabFrameComponent;
TabFrameNamespace.Dominant = TabDominant;
TabFrameNamespace.Secondary = TabSecondary;
TabFrameNamespace.Residual = TabResidual;

export default TabFrameNamespace;