import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type AlertIntent = "neutral" | "warning" | "critical";

type AlertCardProps = {
  text: string;
  intent?: AlertIntent;
  className?: string;
};

function intentStyles(intent: AlertIntent) {
  // Color només per estat (cànon)
  if (intent === "critical") {
    return {
      border: "1px solid rgba(143,45,45,0.35)",
      bg: "rgba(143,45,45,0.06)",
      dot: "var(--viho-danger, #8F2D2D)",
    };
  }
  if (intent === "warning") {
    return {
      border: "1px solid rgba(242,106,33,0.35)",
      bg: "rgba(242,106,33,0.06)",
      dot: "var(--viho-warn, #F26A21)",
    };
  }
  return {
    border: "1px solid var(--viho-border)",
    bg: "rgba(90,46,58,0.04)",
    dot: "var(--viho-muted)",
  };
}

export function AlertCard({ text, intent = "warning", className }: AlertCardProps) {
  const s = intentStyles(intent);

  return (
    <Card
      className={cn("rounded-2xl", className)}
      style={{ border: s.border, background: s.bg }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 inline-block h-2 w-2 rounded-full"
            style={{ background: s.dot }}
          />
          <div className="text-[13px] leading-relaxed" style={{ color: "var(--viho-text)" }}>
            {text}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

