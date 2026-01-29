// src/app/api/extract-pdf-text/route.ts
import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf/extractPdfText";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No se recibió 'file'." },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { text, numpages, meta } = await extractPdfText(buf);

    return NextResponse.json({
      ok: true,
      text,
      numpages,
      meta,
      isLikelyScanned: !text || text.trim().length < 20,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error extrayendo texto del PDF (pdf-parse)" },
      { status: 500 }
    );
  }
}
