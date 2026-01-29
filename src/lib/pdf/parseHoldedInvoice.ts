// src/lib/pdf/parseHoldedInvoice.ts

type Parsed = {
  invoiceNumber: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  clientName: string | null;
  clientVatId: string | null; // NIF/CIF del cliente (46705395P, 47971402A...)
  totalNet: number | null;     // base imponible
  totalVat: number | null;     // importe IVA
  totalGross: number | null;   // total factura
  vatRate: number | null;      // 10, 21, ...
  confidence: number;
};

function clean(s: string) {
  return s.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").trim();
}

// "1.234,56€" -> 1234.56
function parseEuro(s: string): number | null {
  const t = clean(s).replace(/€/g, "").trim();
  if (!t) return null;
  const normalized = t.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// dd/mm/yyyy -> yyyy-mm-dd
function parseDateES(s: string): string | null {
  const m = clean(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseHoldedInvoiceText(text: string): Parsed {
  const raw = (text || "").replace(/\r/g, "");
  const lines = raw.split("\n").map(clean).filter(Boolean);

  let invoiceNumber: string | null = null;
  let invoiceDate: string | null = null;
  let clientName: string | null = null;
  let clientVatId: string | null = null;

  // 1) Número factura: "FACTURA F260002"
  for (const l of lines) {
    const m = l.match(/^FACTURA\s+([A-Z0-9-]+)$/i);
    if (m) {
      invoiceNumber = m[1].trim();
      break;
    }
  }

  // 2) Fecha: "Fecha: 15/01/2026"
  for (const l of lines) {
    const m = l.match(/^Fecha:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})$/i);
    if (m) {
      invoiceDate = parseDateES(m[1]);
      break;
    }
  }

  // 3) Cliente + VAT ID: después de la línea "Cliente"
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Cliente") {
      const maybeName = lines[i + 1] || "";
      const maybeVat = lines[i + 2] || "";
      if (maybeName) clientName = maybeName;
      // NIF/CIF típico: letras/números 7-12
      if (maybeVat && /^[A-Z0-9]{7,12}$/i.test(maybeVat)) clientVatId = maybeVat.toUpperCase();
      break;
    }
  }

  // 4) Totales desde el bloque "BASE IMPONIBLE ... IVA XX% ...":
  // Ej: "310,00€ IVA 10% 31,00€ 341,00€"
  let totalNet: number | null = null;
  let totalVat: number | null = null;
  let totalGross: number | null = null;
  let vatRate: number | null = null;

  const reTotals =
    /^(\d{1,3}(?:\.\d{3})*,\d{2})€\s+IVA\s+(\d{1,2})%\s+(\d{1,3}(?:\.\d{3})*,\d{2})€\s+(\d{1,3}(?:\.\d{3})*,\d{2})€$/i;

  for (const l of lines) {
    const m = l.match(reTotals);
    if (m) {
      totalNet = parseEuro(m[1]);
      vatRate = Number(m[2]);
      totalVat = parseEuro(m[3]);
      totalGross = parseEuro(m[4]);
      break;
    }
  }

  // Confidence simple
  let confidence = 0;
  if (invoiceNumber) confidence += 25;
  if (invoiceDate) confidence += 20;
  if (clientName) confidence += 15;
  if (clientVatId) confidence += 15;
  if (totalNet != null && totalVat != null && totalGross != null) confidence += 25;
  if (confidence > 100) confidence = 100;

  return {
    invoiceNumber,
    invoiceDate,
    clientName,
    clientVatId,
    totalNet,
    totalVat,
    totalGross,
    vatRate: Number.isFinite(vatRate as any) ? vatRate : null,
    confidence,
  };
}
