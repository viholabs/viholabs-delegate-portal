import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  right?: React.ReactNode;
  className?: string;
};

export function KpiCard({ label, value, hint, right, className }: KpiCardProps) {
  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--viho-muted)" }}
            >
              {label}
            </div>
            <div
              className="mt-1 text-[26px] font-semibold leading-none"
              style={{ color: "var(--viho-text)" }}
            >
              {value}
            </div>
            {hint ? (
              <div className="mt-2 text-[12px]" style={{ color: "var(--viho-muted)" }}>
                {hint}
              </div>
            ) : null}
          </div>

          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
