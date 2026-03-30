"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DelegateRow } from "./types";
import { safeStr } from "./utils";

type Props = {
  delegates: DelegateRow[];
  delegatesLoad: "idle" | "loading" | "ok" | "forbidden" | "error";
  selectedDelegateId: string;
  selectedDelegate: DelegateRow | null;
  onChange: (delegateId: string) => void;
};

export default function DelegateSelectorCard({
  delegates,
  delegatesLoad,
  selectedDelegateId,
  selectedDelegate,
  onChange,
}: Props) {
  return (
    <Card
      style={{
        marginBottom: 14,
        borderColor: "#e7d8bc",
        boxShadow: "0 1px 2px rgba(90,46,58,0.04)",
      }}
    >
      <CardHeader style={{ paddingBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <CardTitle style={{ fontSize: 16, color: "#5a2e3a" }}>Delegado</CardTitle>
          <div style={{ fontSize: 12, color: "#7f6d61" }}>
            {delegatesLoad === "loading"
              ? "cargando…"
              : delegatesLoad === "ok"
                ? `${delegates.length} delegados`
                : delegatesLoad === "error"
                  ? "error"
                  : "—"}
          </div>
        </div>
      </CardHeader>

      <CardContent style={{ paddingTop: 0 }}>
        <select
          value={selectedDelegateId}
          onChange={(e) => onChange(e.target.value)}
          disabled={delegatesLoad === "loading" || delegatesLoad === "error"}
          style={{
            width: "100%",
            height: 38,
            borderRadius: 10,
            border: "1px solid #ddd",
            padding: "0 10px",
            background: delegatesLoad === "loading" || delegatesLoad === "error" ? "#f8f8f8" : "#fff",
          }}
        >
          <option value="">— Sin delegado (scope propio) —</option>
          {delegates.map((d) => (
            <option key={d.id} value={d.id}>
              {safeStr(d.name || d.email || d.id)}
            </option>
          ))}
        </select>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b5c53", lineHeight: 1.45 }}>
          {!selectedDelegateId
            ? "Selecciona un delegado para cargar los clientes asociados. Los productos no dependen del delegado."
            : `Delegado activo: ${safeStr(selectedDelegate?.name || selectedDelegate?.email || "—")}.`}
        </div>
      </CardContent>
    </Card>
  );
}