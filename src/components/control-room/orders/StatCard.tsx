// src/components/control-room/orders/StatCard.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle: string;
};

export default function StatCard({
  title,
  value,
  subtitle,
}: StatCardProps) {
  return (
    <Card
      style={{
        borderColor: "#e7d8bc",
        boxShadow: "0 1px 2px rgba(90,46,58,0.04)",
      }}
    >
      <CardHeader style={{ paddingBottom: 8 }}>
        <CardTitle
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#8b7355",
            fontWeight: 700,
          }}
        >
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent style={{ paddingTop: 0 }}>
        <div
          style={{
            fontSize: 32,
            lineHeight: 1,
            fontWeight: 700,
            color: "#5a2e3a",
            marginBottom: 8,
          }}
        >
          {value}
        </div>

        <div
          style={{
            fontSize: 13,
            color: "#6b5c53",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </CardContent>
    </Card>
  );
}