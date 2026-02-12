import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type StatusIntent = "default" | "cert" | "warning";

type StatusCardProps = {
  label: string;
  value: React.ReactNode;
  intent?: StatusIntent;
  className?: string;
};

function intentColor(intent: StatusIntent) {
  if (intent === "cert") return "var(--viho-cert, #C7AE6A)";
  if (intent === "warning") return "var(--viho-warn, #F26A21)";
  return "var(--viho-muted)";
}

export function StatusCard({ label, value, intent = "default", className }: StatusCardProps) {
  const c = intentColor(intent);

  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--viho-muted)" }}
            >
              {label}
            </div>
            <div className="mt-1 text-[14px] font-semibold" style={{ color: "var(--viho-text)" }}>
              {value}
            </div>
          </div>

          <span
            className="inline-block h-2 w-2 rounded-full"
            aria-hidden="true"
            style={{ background: c }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
