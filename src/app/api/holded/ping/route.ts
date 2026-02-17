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

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && `${v}`.trim() !== "") return v;
  }
  return null;
}

/* ============================
   Timestamp helpers (seconds/ms)
   ============================ */

function toISODateFromAny(v: any): string | null {
  // Accepta:
  // - number: segons o mil·lisegons
  // - string: ISO o "YYYY-MM-DD..."
  if (typeof v === "number" && Number.isFinite(v)) {
    // Heurística:
    //  - si és molt gran (>= 1e12) → mil·lisegons
    //  - sinó → segons
    const ms = v >= 1_000_000_000_000 ? v : v * 1000;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (s.length >= 10) return s.slice(0, 10);
  }

  return null;
}

/* ============================
   HOLDed FIELD NORMALIZATION
   ============================ */

function pickNumber(anyObj: any): string | null {
  const v =
    anyObj?.docNumber ??
    anyObj?.documentNumber ??
    anyObj?.invoiceNumber ??
    anyObj?.number ??
    anyObj?.num ??
    anyObj?.serial ??
    anyObj?.code ??
    null;

  return v != null ? String(v) : null;
}

function pickDate(anyObj: any): string | null {
  // El teu payload (debug) conté: date, dueDate, accountingDate.
  // createdAt NO hi surt, així que NO hi confiem.
  const raw =
    anyObj?.date ??
    anyObj?.accountingDate ??
    anyObj?.dueDate ??
    anyObj?.forecastDate ??
    anyObj?.createdAt ?? // si algun dia apareix, ok
    anyObj?.updatedAt ??
    null;

  const iso = toISODateFromAny(raw);
  if (iso) return iso;

  // De vegades pot venir com a string buit o null; provem específicament altres camps:
  const raw2 = pick(anyObj, ["date", "accountingDate", "dueDate", "forecastDate"]);
  return toISODateFromAny(raw2);
}

function pickTotal(anyObj: any): number | null {
  const v = pick(anyObj, ["total", "totalAmount", "total_amount", "gross", "amount"]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickStatus(anyObj: any): string | null {
  const v = pick(anyObj, ["status", "state", "paymentStatus", "payment_status"]);
  if (typeof v === "string" && v.length > 0) return v;

  if (anyObj?.paid === true || anyObj?.isPaid === true) return "paid";
  if (anyObj?.paid === false || anyObj?.isPaid === false) return "unpaid";

  return null;
}

function pickContactName(anyObj: any): string | null {
  const v =
    anyObj?.contactName ??
    anyObj?.contact_name ??
    anyObj?.clientName ??
    anyObj?.customerName ??
    anyObj?.contact?.name ??
    anyObj?.client?.name ??
    anyObj?.customer?.name ??
    null;

  return v != null ? String(v) : null;
}

/* ============================
   API HANDLER
   ============================ */

export async function GET(req: Request) {
  let stage = "init";

  try {
    stage = "auth_actor";
    const ar: any = await getActorFromRequest(req);

    if (!ar?.ok) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "Unauthorized",
      });
    }

    const roleRaw = ar?.actor?.role ?? "";
    const role = normalizeRole(roleRaw);
    const allowed = new Set(["super_admin", "admin", "superadmin"]);

    if (!allowed.has(role)) {
      return json(403, {
        ok: false,
        stage,
        error: "Forbidden (admin only)",
        role_raw: roleRaw,
        role_norm: role,
      });
    }

    stage = "env";

    const baseUrl = (process.env.HOLDED_BASE_URL ?? "https://api.holded.com").replace(/\/+$/, "");
    const docType = process.env.HOLDED_DOC_TYPE ?? "invoice";
    const apiKey = (process.env.HOLDED_API_KEY ?? "").trim();

    if (!apiKey) {
      return json(500, {
        ok: false,
        stage,
        error: "Missing HOLDED_API_KEY",
        base_url: baseUrl,
        doc_type: docType,
      });
    }

    stage = "params";

    const u = new URL(req.url);
    const page = toInt(u.searchParams.get("page"), 1);
    const debug = u.searchParams.get("debug") === "1";

    stage = "fetch_holded";

    const url = `${baseUrl}/api/invoicing/v1/documents/${encodeURIComponent(docType)}?page=${page}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        key: apiKey,
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

    const list = Array.isArray(data) ? data : data?.data ?? data?.results ?? [];
    const rows = Array.isArray(list) ? list : [];

    stage = "normalize";

    const normalized = rows.map((x: any) => ({
      holded_id: x?.id ?? null,
      number: pickNumber(x),
      date: pickDate(x),
      status: pickStatus(x),
      total: pickTotal(x),
      currency: x?.currency ?? x?.currencyCode ?? "EUR",
      contact_name: pickContactName(x),
    }));

    const sample0 = rows[0] ?? null;

    return json(200, {
      ok: true,
      stage: "ok",
      holded: {
        base_url: baseUrl,
        doc_type: docType,
        page,
        count: normalized.length,
      },
      invoices: normalized,
      debug: debug
        ? {
            sample_keys: sample0 && typeof sample0 === "object" ? Object.keys(sample0).slice(0, 140) : [],
            sample_selected: sample0
              ? {
                  // raw values (per acabar amb el bucle)
                  raw_date: sample0?.date ?? null,
                  raw_accountingDate: sample0?.accountingDate ?? null,
                  raw_dueDate: sample0?.dueDate ?? null,
                  raw_forecastDate: sample0?.forecastDate ?? null,

                  // normalized guesses
                  date_guess: pickDate(sample0),
                  number_guess: pickNumber(sample0),
                  contact_guess: pickContactName(sample0),
                  status_guess: pickStatus(sample0),
                  total_guess: pickTotal(sample0),
                }
              : null,
          }
        : undefined,
      actor: {
        id: ar.actor?.id,
        role: roleRaw,
        name: ar.actor?.name ?? ar.actor?.email ?? "—",
      },
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Unexpected error",
    });
  }
}
