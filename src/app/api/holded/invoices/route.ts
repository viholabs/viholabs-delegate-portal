// src/app/api/holded/invoices/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normalizeRole(role: any): string {
  return String(role ?? "").trim().toLowerCase();
}

function toInt(s: string | null, fallback: number) {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function pickDate(anyObj: any): string | null {
  // HOLDed puede usar varios nombres de campo según endpoint/versión
  const candidates = [
    anyObj?.date,
    anyObj?.createdAt,
    anyObj?.created_at,
    anyObj?.issueDate,
    anyObj?.issue_date,
  ];
  const v = candidates.find((x) => typeof x === "string" && x.length >= 8);
  return v ?? null;
}

function pickTotal(anyObj: any): number | null {
  const candidates = [
    anyObj?.total,
    anyObj?.totalAmount,
    anyObj?.total_amount,
    anyObj?.gross,
    anyObj?.amount,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickStatus(anyObj: any): string | null {
  const candidates = [
    anyObj?.status,
    anyObj?.state,
    anyObj?.paymentStatus,
    anyObj?.payment_status,
    anyObj?.paid ? "paid" : null,
    anyObj?.isPaid ? "paid" : null,
  ];
  const v = candidates.find((x) => typeof x === "string" && x.length > 0);
  return v ?? null;
}

export async function GET(req: Request) {
  let stage = "init";

  try {
    // 1) Auth + actor (admin only)
    stage = "auth_actor";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) {
      return json(ar?.status ?? 401, { ok: false, stage, error: ar?.error ?? "Unauthorized" });
    }

    const roleRaw = ar?.actor?.role ?? "";
    const role = normalizeRole(roleRaw);
    const allowed = new Set(["super_admin", "admin", "superadmin"]);
    if (!allowed.has(role)) {
      return json(403, { ok: false, stage, error: "Forbidden (admin only)", role_raw: roleRaw, role_norm: role });
    }

    // 2) Env config
    stage = "env";
    const baseUrl = (process.env.HOLDED_BASE_URL ?? "https://api.holded.com").replace(/\/+$/, "");
    const docType = process.env.HOLDED_DOC_TYPE ?? "invoice";
    const apiKey = process.env.HOLDED_API_KEY ?? "";

    if (!apiKey || apiKey === "RELLENAR_EN_LOCAL_NO_PEGAR_EN_CHAT") {
      return json(500, {
        ok: false,
        stage,
        error: "Falta HOLDED_API_KEY en el servidor. Rellénala en .env.local.",
        base_url: baseUrl,
        doc_type: docType,
      });
    }

    // 3) Params
    stage = "params";
    const u = new URL(req.url);
    const page = toInt(u.searchParams.get("page"), 1);

    // 4) Call HOLDed API (list documents)
    stage = "fetch_holded";
    const url = `${baseUrl}/api/invoicing/v1/documents/${encodeURIComponent(docType)}?page=${page}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        key: apiKey, // HOLDed usa header "key"
      } as any,
      cache: "no-store",
    });

    const rawText = await resp.text();
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = { non_json: true, rawText: rawText?.slice(0, 500) };
    }

    if (!resp.ok) {
      return json(resp.status, {
        ok: false,
        stage,
        error: "HOLDed API error",
        http_status: resp.status,
        url,
        sample: data,
      });
    }

    // HOLDed a veces devuelve array directo o estructura {data/results/...}
    const list = Array.isArray(data) ? data : (data?.data ?? data?.results ?? []);
    const rows = Array.isArray(list) ? list : [];

    // 5) Normalize (read-only)
    stage = "normalize";
    const normalized = rows.map((x: any) => ({
      holded_id: x?.id ?? null,
      number: x?.number ?? x?.num ?? null,
      date: pickDate(x),
      status: pickStatus(x),
      total: pickTotal(x),
      currency: x?.currency ?? x?.currencyCode ?? "EUR",
      contact_name: x?.contact?.name ?? x?.client?.name ?? x?.customer?.name ?? null,
      raw: undefined as any, // NO devolvemos el objeto entero por defecto
    }));

    return json(200, {
      ok: true,
      stage: "ok",
      holded: { base_url: baseUrl, doc_type: docType, page, count: normalized.length },
      invoices: normalized,
      actor: { id: ar.actor?.id, role: roleRaw, name: ar.actor?.name ?? ar.actor?.email ?? "—" },
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
