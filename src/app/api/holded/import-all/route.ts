import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function unixToDate(unix?: number | null): string | null {
  if (!unix) return null;
  const d = new Date(unix * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function monthFromUnix(unix?: number | null): string | null {
  if (!unix) return null;
  const d = new Date(unix * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function deriveIsPaidFromPayments(paid: number, pending: number) {
  // Regla simple per MVP:
  // - si pending > 0 -> no pagada (o parcial)
  // - si pending <= 0 i paid > 0 -> pagada
  if (pending > 0) return false;
  if (paid > 0 && pending <= 0) return true;
  return false;
}

function holdedHeaders() {
  // ✅ HOLDed API: usa X-API-KEY (no Bearer)
  // ✅ Accept JSON per forçar resposta JSON
  return {
    Accept: "application/json",
    "X-API-KEY": process.env.HOLDED_API_KEY ?? "",
  } as Record<string, string>;
}

async function safeParseJson(res: Response) {
  // Evita petar amb "Unexpected token '<'" quan el server retorna HTML
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  const text = await res.text();

  if (!ct.includes("application/json")) {
    return {
      ok: false,
      contentType: ct || null,
      preview: text.slice(0, 200),
      json: null,
    };
  }

  try {
    return { ok: true, contentType: ct, preview: null, json: JSON.parse(text) };
  } catch (e: any) {
    return {
      ok: false,
      contentType: ct,
      preview: text.slice(0, 200),
      json: null,
    };
  }
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    stage = "parse_body";
    const body = await req.json().catch(() => null);
    const sourceMonth: string | undefined = body?.source_month;

    if (!sourceMonth || !/^\d{4}-\d{2}-01$/.test(sourceMonth)) {
      return json(400, {
        ok: false,
        stage,
        error: "source_month inválido (YYYY-MM-01)",
      });
    }

    // Validació env mínima (sense exposar secrets)
    stage = "env_check";
    if (!process.env.HOLDED_API_BASE_URL) {
      return json(500, {
        ok: false,
        stage,
        error: "HOLDED_API_BASE_URL no definida en runtime",
      });
    }
    if (!process.env.HOLDED_API_KEY) {
      return json(500, {
        ok: false,
        stage,
        error: "HOLDED_API_KEY no definida en runtime",
      });
    }

    stage = "supabase_init";
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ✅ LOCK real: existeix fila amb locked_month = sourceMonth
    stage = "check_lock";
    const { data: lockRow, error: lockErr } = await supabase
      .from("commission_month_locks")
      .select("id")
      .eq("locked_month", sourceMonth)
      .maybeSingle();

    if (lockErr) {
      return json(500, { ok: false, stage, error: lockErr.message });
    }

    if (lockRow?.id) {
      return json(409, {
        ok: false,
        stage,
        error: `Mes ${sourceMonth} bloqueado`,
      });
    }

    // ✅ Llista HOLDed (pàgina 1 de moment)
    stage = "holded_list";
    const listUrl = `${process.env.HOLDED_API_BASE_URL}/invoices?page=1`;
    const listRes = await fetch(listUrl, { headers: holdedHeaders() });

    if (!listRes.ok) {
      const parsed = await safeParseJson(listRes);
      return json(502, {
        ok: false,
        stage,
        error: "Error listando facturas HOLDed",
        http_status: listRes.status,
        holded_content_type: parsed.contentType,
        holded_preview: parsed.preview,
      });
    }

    const parsedList = await safeParseJson(listRes);
    if (!parsedList.ok) {
      return json(502, {
        ok: false,
        stage,
        error: "HOLDed devolvió respuesta no-JSON en listado",
        holded_content_type: parsedList.contentType,
        holded_preview: parsedList.preview,
      });
    }

    const listJson: any = parsedList.json;

    // HOLDed pot retornar array directe o objecte amb data
    const items: Array<{ id: string }> = Array.isArray(listJson)
      ? listJson
      : (listJson?.data ?? []);

    let inserted = 0;
    let updated = 0;
    let skipped_other_month = 0;

    for (const item of items) {
      stage = `holded_detail:${item.id}`;

      const detUrl = `${process.env.HOLDED_API_BASE_URL}/invoices/${item.id}`;
      const detRes = await fetch(detUrl, { headers: holdedHeaders() });

      if (!detRes.ok) continue;

      const parsedDet = await safeParseJson(detRes);
      if (!parsedDet.ok) continue;

      const inv: any = parsedDet.json;

      // ✅ Filtre per mes: només el mes seleccionat segons inv.date (unix seconds)
      const invoiceMonth = monthFromUnix(inv?.date ?? null);
      if (invoiceMonth !== sourceMonth) {
        skipped_other_month += 1;
        continue;
      }

      // ✅ Normalitzacions mínimes
      const invoiceDate = unixToDate(inv?.date ?? null);

      const totalGross = Number(inv?.total ?? 0) || 0;
      const totalNet = inv?.subtotal == null ? null : Number(inv.subtotal);
      const totalVat = inv?.tax == null ? null : Number(inv.tax);

      const paymentsTotal = Number(inv?.paymentsTotal ?? 0) || 0;
      const paymentsPending = Number(inv?.paymentsPending ?? 0) || 0;
      const paymentsRefunds = Number(inv?.paymentsRefunds ?? 0) || 0;

      const isPaid = deriveIsPaidFromPayments(paymentsTotal, paymentsPending);

      // ✅ Idempotència sense tocar Supabase:
      // Fem servir source_file_hash (UNIQUE) com a clau estable "holded:<id>"
      const holdedId = String(inv?.id ?? item.id);
      const holdedHash = `holded:${holdedId}`;

      // ✅ Guardem tot el que no tenim com a columnes dins source_meta
      const sourceMeta = {
        provider: "holded",
        holded_id: holdedId,
        docNumber: inv?.docNumber ?? null,
        paymentsTotal,
        paymentsPending,
        paymentsRefunds,
        raw: inv, // MVP: guardem raw per auditar (després ho netegem)
      };

      // ✅ Payload adaptat a la teva taula invoices
      const payload: any = {
        invoice_number: inv?.docNumber ?? holdedHash, // sempre text; fallback estable
        invoice_date: invoiceDate,
        currency: "EUR",
        total_net: totalNet,
        total_vat: totalVat,
        total_gross: totalGross,
        is_paid: isPaid,
        paid_date: null,

        source_month: sourceMonth,
        source_provider: "holded",
        source_filename: holdedId,
        source_file_hash: holdedHash,
        source_meta: sourceMeta,

        needs_review: true,
        updated_at: new Date().toISOString(),
      };

      // ✅ UPSERT per source_file_hash (únic a la teva taula)
      stage = `upsert:${item.id}`;
      const { error: upErr } = await supabase
        .from("invoices")
        .upsert(payload, { onConflict: "source_file_hash" });

      if (upErr) continue;

      // MVP: comptador best-effort
      inserted += 1;
    }

    return json(200, {
      ok: true,
      stage: "done",
      source_month: sourceMonth,
      result: { inserted, updated, skipped_other_month },
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}
