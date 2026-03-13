import nodemailer from "nodemailer";

type ProductionLine = {
  sku: string;
  units: number;
  price: number | null;
};

type SendProductionEmailArgs = {
  clientName: string;
  holdedContactId: string;
  delegateId: string | null;
  orderDate: string;
  items: ProductionLine[];
  holdedResponseText: string;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildItemsText(items: ProductionLine[]) {
  return items
    .map((item, index) => {
      const priceText = item.price == null ? "sin precio forzado" : `${item.price} €`;
      return `${index + 1}. ${item.sku} · unidades: ${item.units} · precio: ${priceText}`;
    })
    .join("\n");
}

function buildItemsHtml(items: ProductionLine[]) {
  return items
    .map((item) => {
      const priceText = item.price == null ? "sin precio forzado" : `${item.price} €`;
      return `<li><strong>${escapeHtml(item.sku)}</strong> · unidades: ${item.units} · precio: ${escapeHtml(
        priceText
      )}</li>`;
    })
    .join("");
}

function describeEmailError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Error desconocido de email";
  }

  const maybe = error as Error & {
    code?: string;
    response?: string;
    responseCode?: number;
    command?: string;
  };

  const parts = [
    maybe.message,
    maybe.code ? `code=${maybe.code}` : "",
    typeof maybe.responseCode === "number" ? `responseCode=${maybe.responseCode}` : "",
    maybe.command ? `command=${maybe.command}` : "",
    maybe.response ? `response=${maybe.response}` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

export async function sendProductionEmail(args: SendProductionEmailArgs): Promise<{
  ok: true;
  messageId: string;
}> {
  const host = env("SMTP_HOST");
  const port = Number(env("SMTP_PORT"));
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const from = env("EMAIL_FROM");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: {
      user,
      pass,
    },
    authMethod: "LOGIN",
    tls: {
      servername: host,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  try {
    await transporter.verify();
  } catch (error) {
    throw new Error(`SMTP verify failed: ${describeEmailError(error)}`);
  }

  const subject = `NUEVO PEDIDO — ${args.clientName}`;

  const text = [
    "NUEVO PEDIDO",
    "",
    `Cliente: ${safeStr(args.clientName)}`,
    `Holded contact ID: ${safeStr(args.holdedContactId)}`,
    `Delegate actor ID: ${safeStr(args.delegateId ?? "—")}`,
    `Fecha: ${safeStr(args.orderDate)}`,
    "",
    "Líneas:",
    buildItemsText(args.items),
    "",
    "Respuesta Holded:",
    safeStr(args.holdedResponseText) || "Sin respuesta textual",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#222;">
      <h2 style="margin:0 0 16px 0;">NUEVO PEDIDO</h2>

      <p><strong>Cliente:</strong> ${escapeHtml(safeStr(args.clientName))}</p>
      <p><strong>Holded contact ID:</strong> ${escapeHtml(safeStr(args.holdedContactId))}</p>
      <p><strong>Delegate actor ID:</strong> ${escapeHtml(safeStr(args.delegateId ?? "—"))}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(safeStr(args.orderDate))}</p>

      <h3 style="margin-top:24px;">Líneas</h3>
      <ul>
        ${buildItemsHtml(args.items)}
      </ul>

      <h3 style="margin-top:24px;">Respuesta Holded</h3>
      <pre style="white-space:pre-wrap; background:#f7f7f7; padding:12px; border-radius:8px;">${escapeHtml(
        safeStr(args.holdedResponseText) || "Sin respuesta textual"
      )}</pre>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from,
      to: "distribucion@viholabs.com",
      subject,
      text,
      html,
    });

    return {
      ok: true,
      messageId: info.messageId ?? "",
    };
  } catch (error) {
    throw new Error(`SMTP send failed: ${describeEmailError(error)}`);
  }
}