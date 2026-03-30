import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function getInternalBearerFromRequest(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.VIHOLABS_INTERNAL_BEARER ?? "").trim();
  const got = getInternalBearerFromRequest(req);
  return !!expected && !!got && expected === got;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ invoiceId: string }> }
) {
  try {
    if (!isAuthorized(req)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const { invoiceId } = await context.params;
    const apiKey = String(process.env.HOLDED_API_KEY ?? "").trim();

    if (!apiKey) {
      return json(500, { ok: false, error: "Missing env: HOLDED_API_KEY" });
    }

    if (!invoiceId) {
      return json(400, { ok: false, error: "Missing invoiceId" });
    }

    const url = `https://api.holded.com/api/invoicing/v1/documents/invoice/${encodeURIComponent(
      invoiceId
    )}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        key: apiKey,
        accept: "application/json",
      },
      cache: "no-store",
    });

    const rawText = await response.text();

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }

    return json(response.status, {
      ok: response.ok,
      invoiceId,
      holdedStatus: response.status,
      payload: parsed,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}