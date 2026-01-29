// src/lib/pdf/parseHoldedInvoiceItems.ts

export type ParsedInvoiceItem = {
  code: string | null;
  description: string;
  units: number;
  unitNetPrice: number;
  lineNet: number;
  vatRate: number;
  lineVat: number;
  lineGross: number;
  lineType: "billable" | "free";
  sourceRaw: string;
};

function cleanText(s: string) {
  return (s || "").replace(/\r/g, "").replace(/\u00A0/g, " ").trim();
}

function parseEuroToken(t: string): number {
  const x = t.replace(/€/g, "").replace(/\./g, "").replace(/,/g, ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function parseVatToken(t: string): number {
  const n = Number(t.replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

function parseUnits(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type RowNumbers = {
  unitPrice: string;
  units: number;
  subtotal: string;
  vat: string;
  total: string;
};

function extractRowNumbers(row: string): RowNumbers | null {
  const r = row.replace(/\s+/g, "");

  // IVA%
  const vatMatch = r.match(/(\d{1,2}%)/);
  const vat = vatMatch?.[1];
  if (!vat) return null;

  // Importes tipo 123,45€ (o sin €)
  const euroRe = /\d{1,3}(?:\.\d{3})*(?:,\d{2})€?/g;
  const euros = r.match(euroRe) ?? [];
  if (euros.length < 3) return null;

  const unitPrice = euros[0];
  const subtotal = euros[1];
  const total = euros[2];

  if (!unitPrice || !subtotal || !total) return null;

  const idx1 = r.indexOf(unitPrice);
  const idx2 = r.indexOf(subtotal, idx1 + unitPrice.length);
  if (idx1 === -1 || idx2 === -1) return null;

  const between = r.slice(idx1 + unitPrice.length, idx2);
  let units = parseUnits(between);

  // Heurística extra para el caso promo cuando aparece "10,00€" pero significa "1" + "0,00€"
  if (
    units == null &&
    unitPrice.startsWith("0,00") &&
    total.startsWith("0,00")
  ) {
    const m = subtotal.match(/^(\d)(\d,\d{2})€?$/); // ej: 10,00€ => 1 + 0,00€
    if (m) {
      const u = Number(m[1]);
      const fixedSubtotal = `${m[2]}€`;
      if (Number.isFinite(u)) {
        units = u;
        return { unitPrice, units, subtotal: fixedSubtotal, vat, total };
      }
    }
  }

  if (units == null) return null;

  return { unitPrice, units, subtotal, vat, total };
}

export function parseHoldedInvoiceItemsFromText(text: string): {
  items: ParsedInvoiceItem[];
  hints: Record<string, any>;
} {
  const raw = cleanText(text);
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Cabecera tolerante
  const headerIdx = lines.findIndex((l) => {
    const u = l.toUpperCase();
    return (
      u.includes("CONCEPTO") &&
      u.includes("PRECIO") &&
      u.includes("UNIDADES") &&
      u.includes("SUBTOTAL") &&
      u.includes("IVA") &&
      u.includes("TOTAL")
    );
  });

  // Fin tabla
  const endIdx = lines.findIndex((l) => l.toUpperCase().startsWith("BASE IMPONIBLE"));

  const tableLines =
    headerIdx >= 0
      ? lines.slice(headerIdx + 1, endIdx > headerIdx ? endIdx : undefined)
      : lines;

  const items: ParsedInvoiceItem[] = [];
  const descBuf: string[] = [];

  for (const line of tableLines) {
    const nums = extractRowNumbers(line);

    if (!nums) {
      // No es fila numérica => descripción
      descBuf.push(line);
      continue;
    }

    const description = descBuf.join(" ").trim();
    descBuf.length = 0;

    const desc = description || "Item";

    const unitNetPrice = parseEuroToken(nums.unitPrice);
    const units = nums.units;
    const lineNet = parseEuroToken(nums.subtotal);
    const vatRate = parseVatToken(nums.vat);
    const lineGross = parseEuroToken(nums.total);

    const lineVat =
      lineNet > 0 ? Math.round(lineNet * (vatRate / 100) * 100) / 100 : 0;

    const lineType: "billable" | "free" = lineNet > 0 ? "billable" : "free";

    items.push({
      code: null,
      description: desc,
      units,
      unitNetPrice,
      lineNet,
      vatRate,
      lineVat,
      lineGross,
      lineType,
      sourceRaw: `${desc} | ${nums.unitPrice} ${units} ${nums.subtotal} ${nums.vat} ${nums.total}`,
    });
  }

  return {
    items,
    hints: {
      headerFound: headerIdx >= 0,
      headerIdx,
      endIdx,
      tableLinesCount: tableLines.length,
      itemsFound: items.length,
      tablePreview: tableLines.slice(0, 40),
    },
  };
}
