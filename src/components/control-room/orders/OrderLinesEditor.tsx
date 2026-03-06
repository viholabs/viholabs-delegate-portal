"use client";

type ProductRow = {
  id?: string | null;
  sku: string;
  name?: string | null;
  description?: string | null;
  is_bundle?: boolean;
};

export type LineDraft = { sku: string; quantity: number; unit_price: number | null };

function safeStr(v: any): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toNum(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function OrderLinesEditor(props: {
  lines: LineDraft[];
  setLine: (index: number, patch: Partial<LineDraft>) => void;
  removeLine: (index: number) => void;
  addLine: () => void;
  onSelectProduct: (lineIndex: number, chosenSku: string) => void;
  products: ProductRow[];
  productOptions: ProductRow[];
}) {
  const { lines, setLine, removeLine, addLine, onSelectProduct, productOptions } = props;

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 120px 160px 90px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <select
            value={l.sku}
            onChange={(e) => onSelectProduct(i, e.target.value)}
            style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
          >
            <option value="">— Selecciona producto —</option>
            {productOptions.map((p) => (
              <option key={p.sku} value={p.sku} title={safeStr(p.description)}>
                {safeStr(p.name || p.sku)} ({p.sku})
              </option>
            ))}
          </select>

          <input
            type="number"
            min={1}
            step={1}
            value={String(l.quantity)}
            onChange={(e) => setLine(i, { quantity: toNum(e.target.value, 1) })}
            style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
            placeholder="Qty"
          />

          <input
            type="number"
            step="0.01"
            value={l.unit_price == null ? "" : String(l.unit_price)}
            onChange={(e) => setLine(i, { unit_price: e.target.value === "" ? null : toNum(e.target.value, 0) })}
            style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
            placeholder="Precio unit. (opcional)"
          />

          <button
            type="button"
            onClick={() => removeLine(i)}
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

      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={addLine}
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
    </div>
  );
}