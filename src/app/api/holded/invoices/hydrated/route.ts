import { NextResponse } from "next/server";
import { fetchHoldedDocumentDetail } from "@/lib/holded/fetchHoldedDocumentDetail";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  const apiKey = process.env.HOLDED_API_KEY;

  if (!apiKey) {
    return json(500, { ok: false, error: "Missing HOLDED_API_KEY" });
  }

  // 1) LIST REAL
  const listRes = await fetch(
    "https://api.holded.com/api/invoicing/v1/documents/invoice",
    {
      headers: {
        accept: "application/json",
        key: apiKey,
      },
      cache: "no-store",
    }
  );

  if (!listRes.ok) {
    return json(500, {
      ok: false,
      error: `Holded list failed (${listRes.status})`,
    });
  }

  const listData = await listRes.json();

  if (!Array.isArray(listData)) {
    return json(500, {
      ok: false,
      error: "Unexpected Holded list payload",
      payload: listData,
    });
  }

  // 2) HYDRATION REAL
  const hydrated = [];

  for (const doc of listData) {
    const holded_id = doc?.id;

    if (!holded_id) continue;

    const detail = await fetchHoldedDocumentDetail({
      docType: "invoice",
      documentId: holded_id,
      apiKey,
    });

    const unixSeconds = detail?.ok ? detail.data?.date : null;

    hydrated.push({
      holded_id,
      number: doc?.docNumber ?? null,
      total: doc?.total ?? null,
      date: unixSeconds,
      contact_name: doc?.contactName ?? null,
    });
  }

  return json(200, {
    ok: true,
    count: hydrated.length,
    invoices: hydrated,
  });
}
