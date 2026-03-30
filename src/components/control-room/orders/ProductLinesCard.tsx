"use client";

import type { LineDraft, ProductRow } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  products: ProductRow[];
  productOptions: ProductRow[];
  productsLoad: "idle" | "loading" | "ok" | "error";
  productQuery: string;
  lines: LineDraft[];
  onProductQueryChange: (value: string) => void;
  onApplyProductToLine: (lineIndex: number, sku: string) => void;
  onSetLineQuantity: (lineIndex: number, value: string) => void;
  onSetLineUnitPrice: (lineIndex: number, value: string) => void;
  onRemoveLine: (lineIndex: number) => void;
  onAddLine: () => void;
};

export default function ProductLinesCard({
  products,
  productOptions,
  productsLoad,
  productQuery,
  lines,
  onProductQueryChange,
  onApplyProductToLine,
  onSetLineQuantity,
  onSetLineUnitPrice,
  onRemoveLine,
  onAddLine,
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <CardTitle style={{ fontSize: 16, color: "#5a2e3a" }}>Líneas (Producto)</CardTitle>
          <div style={{ fontSize: 12, color: "#7f6d61" }}>
            {productsLoad === "loading"
              ? "cargando…"
              : productsLoad === "ok"
                ? `Productos: ${products.length}`
                : productsLoad === "error"
                  ? "error"
                  : "—"}
          </div>
        </div>
      </CardHeader>

      <CardContent style={{ paddingTop: 0 }}>
        <div style={{ marginBottom: 12 }}>
          <input
            value={productQuery}
            onChange={(e) => onProductQueryChange(e.target.value)}
            placeholder="Buscar producto (nombre o SKU)…"
            style={{
              width: "100%",
              height: 38,
              borderRadius: 10,
              border: "1px solid #ddd",
              padding: "0 10px",
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: "#6b5c53" }}>
            Selecciona el producto por nombre. Si eliges un pack, se auto-rellenan las líneas desde BD.
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {lines.map((l, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1fr) 120px 160px 90px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <select
                value={l.sku}
                onChange={(e) => onApplyProductToLine(i, e.target.value)}
                style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
              >
                <option value="">— Selecciona producto —</option>
                {productOptions.map((p) => (
                  <option key={p.sku} value={p.sku} title={typeof p.description === "string" ? p.description : ""}>
                    {typeof p.name === "string" && p.name.trim() ? p.name : p.sku} ({p.sku})
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                step={1}
                value={String(l.quantity)}
                onChange={(e) => onSetLineQuantity(i, e.target.value)}
                style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                placeholder="Qty"
              />

              <input
                type="number"
                step="0.01"
                value={l.unit_price == null ? "" : String(l.unit_price)}
                onChange={(e) => onSetLineUnitPrice(i, e.target.value)}
                style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                placeholder="Precio unit. (opcional)"
              />

              <button
                type="button"
                onClick={() => onRemoveLine(i)}
                disabled={lines.length <= 1}
                style={{
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: lines.length <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onAddLine}
            style={{
              height: 38,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              padding: "0 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            + Añadir línea
          </button>
        </div>
      </CardContent>
    </Card>
  );
}