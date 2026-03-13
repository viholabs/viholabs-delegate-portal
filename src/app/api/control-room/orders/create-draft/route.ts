import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendProductionEmail } from "@/lib/email/sendProductionEmail";

export const runtime = "nodejs";

type PortalLine = {
  sku?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
};

type PortalBody = {
  client_id?: string | null;
  delegate_id?: string | null;
  items?: PortalLine[] | null;
};

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const holdedApiKey = process.env.HOLDED_API_KEY;
    if (!holdedApiKey) {
      return json(500, { ok: false, error: "HOLDED_API_KEY no configurada" });
    }

    const body = (await req.json().catch(() => null)) as PortalBody | null;
    if (!body) {
      return json(400, { ok: false, error: "Body JSON inválido" });
    }

    const clientId = safeStr(body.client_id);
    if (!clientId) {
      return json(400, { ok: false, error: "client_id requerido" });
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const cleanItems = rawItems
      .map((item) => ({
        sku: safeStr(item?.sku),
        units: Math.max(1, Math.floor(toNum(item?.quantity, 1))),
        price:
          item?.unit_price == null || item?.unit_price === ""
            ? null
            : toNum(item?.unit_price, 0),
      }))
      .filter((item) => item.sku.length > 0);

    if (!cleanItems.length) {
      return json(400, { ok: false, error: "items requeridos" });
    }

    const supabase = getServiceSupabase();

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, holded_contact_id")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError) {
      return json(500, { ok: false, error: clientError.message });
    }

    if (!client) {
      return json(404, { ok: false, error: "Cliente no encontrado" });
    }

    const holdedContactId = safeStr(client.holded_contact_id);
    if (!holdedContactId) {
      return json(400, {
        ok: false,
        error: "El cliente no tiene holded_contact_id",
        client_id: clientId,
        client_name: client.name ?? null,
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    const holdedPayload = {
      contactId: holdedContactId,
      date: today,
      items: cleanItems.map((item) => ({
        sku: item.sku,
        units: item.units,
        ...(item.price == null ? {} : { price: item.price }),
      })),
    };

    const response = await fetch("https://api.holded.com/api/invoicing/v1/documents/salesorder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        key: holdedApiKey,
      },
      body: JSON.stringify(holdedPayload),
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      return json(response.status, {
        ok: false,
        error: `Holded ${response.status}: ${responseText || "Error sin detalle"}`,
        holded_status: response.status,
        holded_error: responseText,
        sent_payload: holdedPayload,
      });
    }

    let emailResult:
      | { ok: true; messageId: string }
      | { ok: false; error: string } = { ok: true, messageId: "" };

    try {
      const sent = await sendProductionEmail({
        clientName: safeStr(client.name) || clientId,
        holdedContactId,
        delegateId: body.delegate_id ? safeStr(body.delegate_id) : null,
        orderDate: today,
        items: cleanItems,
        holdedResponseText: responseText,
      });

      emailResult = {
        ok: true,
        messageId: sent.messageId,
      };
    } catch (error) {
      emailResult = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown email error",
      };
    }

    return json(200, {
      ok: true,
      message: "OK — pedido borrador enviado a Producción.",
      holded_status: response.status,
      holded_response_text: responseText,
      email: emailResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown create-draft error";

    return json(500, {
      ok: false,
      error: message,
    });
  }
}