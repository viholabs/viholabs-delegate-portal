import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key);
}

function generateMandateReference(clientId: string) {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);

  return `VIHO-${clientId.slice(0, 8).toUpperCase()}-${ts}`;
}

function compact(value: unknown) {
  if (value === null || value === undefined) return "—";
  const safe = String(value).trim();
  return safe.length > 0 ? safe : "—";
}

function normalizeIban(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function formatHumanDate(date: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
  }).format(date);
}

export async function POST(req: NextRequest) {
  try {
    const { client_id } = await req.json();

    if (!client_id) {
      return NextResponse.json(
        { ok: false, error: "client_id required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();

    if (error || !client) {
      return NextResponse.json(
        { ok: false, error: "Client not found" },
        { status: 404 }
      );
    }

    const iban = normalizeIban(client.iban);

    if (!iban) {
      return NextResponse.json(
        { ok: false, error: "Client has no IBAN" },
        { status: 400 }
      );
    }

    const now = new Date();
    const mandateRef =
      typeof client.sepa_reference === "string" && client.sepa_reference.trim()
        ? client.sepa_reference.trim()
        : generateMandateReference(client_id);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const colors = {
      text: rgb(0.12, 0.1, 0.11),
      muted: rgb(0.42, 0.38, 0.4),
      line: rgb(0.82, 0.78, 0.72),
      accent: rgb(0.35, 0.18, 0.23),
      light: rgb(0.97, 0.95, 0.92),
    };

    const marginX = 48;
    const pageWidth = page.getWidth();
    const contentWidth = pageWidth - marginX * 2;
    let y = page.getHeight() - 48;

    const drawLine = (yPos: number) => {
      page.drawLine({
        start: { x: marginX, y: yPos },
        end: { x: pageWidth - marginX, y: yPos },
        thickness: 1,
        color: colors.line,
      });
    };

    const drawText = (
      text: string,
      x: number,
      yPos: number,
      options?: {
        size?: number;
        bold?: boolean;
        color?: ReturnType<typeof rgb>;
      }
    ) => {
      page.drawText(text, {
        x,
        y: yPos,
        size: options?.size ?? 11,
        font: options?.bold ? bold : font,
        color: options?.color ?? colors.text,
      });
    };

    const drawWrappedText = (
      text: string,
      x: number,
      startY: number,
      maxWidth: number,
      size = 10.5,
      lineHeight = 14
    ) => {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(nextLine, size);

        if (width <= maxWidth) {
          currentLine = nextLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }

      if (currentLine) lines.push(currentLine);

      let cursorY = startY;

      for (const line of lines) {
        drawText(line, x, cursorY, { size, color: colors.text });
        cursorY -= lineHeight;
      }

      return cursorY;
    };

    page.drawRectangle({
      x: marginX,
      y: y - 54,
      width: contentWidth,
      height: 54,
      color: colors.light,
      borderColor: colors.line,
      borderWidth: 1,
    });

    drawText("VIHOLABS BIOTECH S.L.", marginX + 16, y - 22, {
      size: 16,
      bold: true,
      color: colors.accent,
    });
    drawText("Mandato SEPA Core / Core Direct Debit Mandate", marginX + 16, y - 40, {
      size: 10.5,
      color: colors.muted,
    });

    y -= 78;

    drawText("DOCUMENTO DE AUTORIZACIÓN DE ADEUDO DIRECTO SEPA", marginX, y, {
      size: 15,
      bold: true,
      color: colors.text,
    });
    y -= 18;

    drawText("Documento formal para firma del deudor", marginX, y, {
      size: 10.5,
      color: colors.muted,
    });
    drawText(formatHumanDate(now), pageWidth - 170, y, {
      size: 10.5,
      color: colors.muted,
    });

    y -= 16;
    drawLine(y);
    y -= 22;

    drawText("1. Referencia y trazabilidad", marginX, y, {
      size: 12,
      bold: true,
      color: colors.accent,
    });
    y -= 18;

    const traceRows = [
      ["Referencia única del mandato", mandateRef],
      ["Código interno cliente", String(client.id)],
      ["Cliente / razón social", compact(client.legal_name || client.name)],
      ["Nombre comercial", compact(client.name)],
      ["Holded contact ID", compact(client.holded_contact_id)],
      ["SEPA status actual", compact(client.sepa_status || "PENDING")],
    ];

    for (const [label, value] of traceRows) {
      drawText(`${label}:`, marginX, y, { size: 10.5, bold: true });
      drawText(value, marginX + 180, y, { size: 10.5 });
      y -= 15;
    }

    y -= 8;
    drawText("2. Datos del acreedor", marginX, y, {
      size: 12,
      bold: true,
      color: colors.accent,
    });
    y -= 18;

    const creditorRows = [
      ["Acreedor", "VIHOLABS BIOTECH S.L."],
      ["Dirección", "España"],
      ["Identificador del acreedor", "Pendiente de completar en entorno corporativo"],
      ["Finalidad", "Cobro de operaciones comerciales autorizadas por el cliente"],
    ];

    for (const [label, value] of creditorRows) {
      drawText(`${label}:`, marginX, y, { size: 10.5, bold: true });
      drawText(value, marginX + 180, y, { size: 10.5 });
      y -= 15;
    }

    y -= 8;
    drawText("3. Datos del deudor", marginX, y, {
      size: 12,
      bold: true,
      color: colors.accent,
    });
    y -= 18;

    const debtorRows = [
      ["Titular de la cuenta", compact(client.bank_account_holder || client.legal_name || client.name)],
      ["NIF / Tax ID", compact(client.tax_id || client.vat_number)],
      ["IBAN", iban],
      [
        "Dirección fiscal",
        [
          compact(client.fiscal_address_line1),
          client.fiscal_address_line2 ? compact(client.fiscal_address_line2) : null,
          [
            client.fiscal_postal_code,
            client.fiscal_city,
            client.fiscal_region,
            client.fiscal_country,
          ]
            .filter(Boolean)
            .join(" "),
        ]
          .filter(Boolean)
          .join(", "),
      ],
      ["Email contacto", compact(client.contact_email)],
      ["Email facturación", compact(client.billing_email)],
    ];

    for (const [label, value] of debtorRows) {
      drawText(`${label}:`, marginX, y, { size: 10.5, bold: true });

      const endY = drawWrappedText(
        String(value),
        marginX + 180,
        y,
        contentWidth - 180,
        10.5,
        14
      );

      y = endY - 4;
    }

    y -= 4;
    drawText("4. Autorización", marginX, y, {
      size: 12,
      bold: true,
      color: colors.accent,
    });
    y -= 18;

    const legalText =
      "Mediante la firma del presente mandato, el deudor autoriza a VIHOLABS BIOTECH S.L. a enviar instrucciones a la entidad del deudor para adeudar en su cuenta los importes derivados de la relación comercial existente, y a la entidad para efectuar los adeudos conforme a dichas instrucciones. El deudor conserva el derecho a solicitar el reembolso a su entidad en los términos y plazos previstos por la normativa SEPA aplicable.";

    y = drawWrappedText(legalText, marginX, y, contentWidth, 10.5, 14) - 14;

    page.drawRectangle({
      x: marginX,
      y: y - 92,
      width: contentWidth,
      height: 92,
      borderColor: colors.line,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    drawText("Lugar y fecha:", marginX + 14, y - 20, {
      size: 10.5,
      bold: true,
    });
    drawLine(y - 34);

    drawText("Firma del titular / sello:", marginX + 14, y - 56, {
      size: 10.5,
      bold: true,
    });
    drawLine(y - 72);

    y -= 120;

    drawText("5. Control documental interno", marginX, y, {
      size: 12,
      bold: true,
      color: colors.accent,
    });
    y -= 18;

    const auditText =
      "Documento generado automáticamente por el Portal Operatiu VIHOLABS. Conservar firmado junto con la documentación contractual y administrativa del cliente. Este PDF constituye soporte documental interno y de trazabilidad.";
    y = drawWrappedText(auditText, marginX, y, contentWidth, 10.5, 14) - 10;

    drawLine(56);
    drawText(
      `Trace ID: ${mandateRef} · Generated at: ${now.toISOString()} · Client ID: ${String(
        client.id
      )}`,
      marginX,
      40,
      {
        size: 8.5,
        color: colors.muted,
      }
    );

    const pdfBytes = await pdfDoc.save();

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        sepa_reference: mandateRef,
        sepa_generated_at: now.toISOString(),
        sepa_status: "GENERATED",
        updated_at: now.toISOString(),
      })
      .eq("id", client_id);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    const safeClientCode = String(client.id).slice(0, 8).toUpperCase();
    const fileName = `SEPA_${safeClientCode}_${now
      .toISOString()
      .slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBytes.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}