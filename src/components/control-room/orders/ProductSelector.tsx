"use client";

import { useMemo } from "react";

type ProductRow = {
  id?: string | null;
  sku: string;
  name?: string | null;
  description?: string | null;
  is_bundle?: boolean;
};

function safeStr(v: any): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export default function ProductSelector(props: {
  products: ProductRow[];
  productQuery: string;
  setProductQuery: (v: string) => void;
  onSelectProduct: (chosenSku: string) => void;
}) {
  const { products, productQuery, setProductQuery, onSelectProduct } = props;

  const productOptions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const base = products;
    const hits = !q
      ? base
      : base.filter((p) => {
          const sku = safeStr(p.sku).toLowerCase();
          const name = safeStr(p.name).toLowerCase();
          const desc = safeStr(p.description).toLowerCase();
          return sku.includes(q) || name.includes(q) || desc.includes(q);
        });
    return hits.slice(0, 120);
  }, [products, productQuery]);

  return (
    <div style={{ marginTop: 10 }}>
      <input
        value={productQuery}
        onChange={(e) => setProductQuery(e.target.value)}
        placeholder="Buscar producto (nombre o SKU)…"
        style={{ width: "100%", height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
      />
      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        Selecciona el producto por nombre. Si eliges un pack, se auto-rellenan las líneas desde BD.
      </div>

      {/* Selector (sin cambiar comportamiento: mismo <select> y mismos <option>) */}
      <div style={{ marginTop: 12 }}>
        <select
          value={""}
          onChange={(e) => onSelectProduct(e.target.value)}
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px", width: "100%" }}
        >
          <option value="">— Selecciona producto —</option>
          {productOptions.map((p) => (
            <option key={p.sku} value={p.sku} title={safeStr(p.description)}>
              {safeStr(p.name || p.sku)} ({p.sku})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}