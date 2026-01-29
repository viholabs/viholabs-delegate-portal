// src/lib/pdf/extractPdfText.ts

/**
 * Extrae texto de PDF con heurística de espacios por posición.
 * IMPORTANTE:
 * - Import dinámico de pdf-parse para evitar crasheos al cargar el módulo en Next.
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<{
  text: string;
  numpages: number;
  meta: any;
}> {
  // ✅ dynamic import (evita "Failed to fetch" por crash en carga de módulo)
  const mod: any = await import("pdf-parse");
  const pdfParse = mod?.default ?? mod;

  const options: any = {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });

      type Item = { str: string; transform: number[]; width?: number };

      const items: Item[] = (textContent.items || []).filter((it: any) => it?.str);

      // Orden lectura: Y desc (arriba->abajo), X asc (izq->der)
      items.sort((a, b) => {
        const ay = a.transform?.[5] ?? 0;
        const by = b.transform?.[5] ?? 0;
        if (Math.abs(by - ay) > 2) return by - ay;
        const ax = a.transform?.[4] ?? 0;
        const bx = b.transform?.[4] ?? 0;
        return ax - bx;
      });

      let out = "";
      let lastY: number | null = null;
      let lastX: number | null = null;

      for (const it of items) {
        const x = it.transform?.[4] ?? 0;
        const y = it.transform?.[5] ?? 0;
        const s = String(it.str ?? "");

        if (lastY !== null && Math.abs(y - lastY) > 6) {
          out += "\n";
          lastX = null;
        } else if (lastX !== null) {
          const gap = x - lastX;
          // 👇 este espacio evita "31,00€10" -> "31,00€ 10"
          if (gap > 6) out += " ";
        }

        out += s;

        // estimación de avance X
        lastY = y;
        lastX = x + (it.width ?? Math.max(8, s.length * 4));
      }

      return out + "\n";
    },
  };

  const res: any = await pdfParse(pdfBuffer, options);

  return {
    text: res?.text || "",
    numpages: res?.numpages || 0,
    meta: res?.info || res?.metadata || {},
  };
}
