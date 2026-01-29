// src/app/api/import-invoice/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { extractPdfText } from "@/lib/pdf/extractPdfText";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function cleanEU(value: string): string {
  return (value || "")
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(/\./g, "")
    .replace(",", ".");
}

function toNumberEU(value: string): number | null {
  const n = Number(cleanEU(value));
  return Number.isFinite(n) ? n : null;
}

function parseSpanishDateToISO(value: string): string | null {
  const m = (value || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function normalizeTaxId(s: string): string {
  return (s || "").toUpperCase().replace(/\s/g, "").replace(/[^A-Z0-9]/g, "");
}

function findTaxIdNear(lines: string[], startIdx: number, lookahead = 12): string | null {
  const nifRe = /\b(\d{8}[A-Z])\b/i;
  const cifRe = /\b([ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])\b/i;

  for (let i = startIdx; i < Math.min(lines.length, startIdx + lookahead); i++) {
    const l = lines[i] || "";
    const m1 = l.match(cifRe);
    if (m1?.[1]) return normalizeTaxId(m1[1]);
    const m2 = l.match(nifRe);
    if (m2?.[1]) return normalizeTaxId(m2[1]);
  }
  return null;
}

function inferSourceChannelFromText(text: string): "online" | "offline" {
  const t = (text || "").toUpperCase();

  // Señales online
  if (t.includes("SHOPIFY")) return "online";
  if (t.includes("SHOPIFY CORRECCIÓN") || t.includes("SHOPIFY CORRECCION")) return "online";
  // Muchos PDFs online traen "#1006" al final (pedido)
  if (/\n#\d{3,}\b/.test(text || "")) return "online";

  // Señales offline
  if (t.includes("ALBARÁN") || t.includes("ALBARAN")) return "offline";

  // Default conservador
  return "offline";
}

type ParsedHeader = {
  invoiceNumber: string | null;
  invoiceDateISO: string | null;
  clientName: string | null;
  clientTaxId: string | null;
  totalNet: number | null;
  totalVat: number | null;
  totalGross: number | null;
};

function parseHeader(text: string): ParsedHeader {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const invMatch =
    (text || "").match(/\bFACTURA\s+([A-Z]?\d{5,})\b/i) ||
    (text || "").match(/\b(F\d{5,})\b/);

  const invoiceNumber = invMatch?.[1] ? String(invMatch[1]).trim() : null;

  const dateMatch = (text || "").match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  const invoiceDateISO = dateMatch?.[1] ? parseSpanishDateToISO(dateMatch[1]) : null;

  let clientName: string | null = null;
  let clientTaxId: string | null = null;

  const idxCliente = lines.findIndex((l) => l.toLowerCase() === "cliente");
  if (idxCliente >= 0) {
    clientName = lines[idxCliente + 1] || null;
    clientTaxId = findTaxIdNear(lines, idxCliente + 2, 12);
  }

  const totalsMatch = (text || "").match(
    /(\d{1,3}(?:\.\d{3})*,\d{2})€\s+IVA\s+(\d{1,2})%\s+(\d{1,3}(?:\.\d{3})*,\d{2})€\s+(\d{1,3}(?:\.\d{3})*,\d{2})€/i
  );

  const totalNet = totalsMatch ? toNumberEU(totalsMatch[1]) : null;
  const totalVat = totalsMatch ? toNumberEU(totalsMatch[3]) : null;
  const totalGross = totalsMatch ? toNumberEU(totalsMatch[4]) : null;

  return {
    invoiceNumber,
    invoiceDateISO,
    clientName: clientName?.trim() || null,
    clientTaxId: clientTaxId || null,
    totalNet,
    totalVat,
    totalGross,
  };
}

type LineType = "sale" | "promotion";

type ParsedItem = {
  description: string;
  units: number;
  unitNetPrice: number;
  lineNetAmount: number;
  vatRate: number;
  lineVatAmount: number;
  lineGrossAmount: number;
  lineType: LineType; // ✅ DB check constraint
};

function parseItemsFromText(text: string): { items: ParsedItem[]; hints: any } {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const headerIdx = lines.findIndex((l) => {
    const u = l.toUpperCase();
    return u.includes("CONCEPTO") && u.includes("PRECIO") && u.includes("UNIDADES") && u.includes("SUBTOTAL");
  });

  const endIdx = lines.findIndex((l) => l.toUpperCase().startsWith("BASE IMPONIBLE"));
  const tableLines =
    headerIdx >= 0 ? lines.slice(headerIdx + 1, endIdx > headerIdx ? endIdx : undefined) : lines;

  const moneyRe = /(\d{1,3}(?:\.\d{3})*,\d{2})€/g;
  const vatRe = /(\d{1,2})%/;

  function monies(raw: string): number[] {
    const arr: number[] = [];
    moneyRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = moneyRe.exec(raw)) !== null) {
      const v = toNumberEU(m[1]);
      if (v !== null) arr.push(v);
    }
    return arr;
  }

  function extractUnits(raw: string): number {
    const m = raw.match(/€\s*(\d{1,4})\s*(?=\d{1,3}(?:\.\d{3})*,\d{2}€)/);
    const n = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(n) || n <= 0) return 1;
    return n;
  }

  function isNumericRow(raw: string): boolean {
    return (raw.match(moneyRe) || []).length >= 2;
  }

  const items: ParsedItem[] = [];
  const descBuf: string[] = [];
  const unmatchedPreview: string[] = [];

  function flushDesc(): string {
    const s = descBuf.join(" ").trim();
    descBuf.length = 0;
    return s;
  }

  for (const raw of tableLines) {
    if (!isNumericRow(raw)) {
      descBuf.push(raw);
      continue;
    }

    const descriptionBase = flushDesc();
    const vatM = raw.match(vatRe);
    const vatRate = vatM ? Number(vatM[1]) || 0 : 0;

    const m = monies(raw);
    if (m.length < 2) {
      unmatchedPreview.push(raw);
      continue;
    }

    const unitNetPrice = m[0] ?? 0;
    const units = extractUnits(raw);
    const lineNetAmount = m[1] ?? 0;

    let lineVatAmount = 0;
    let lineGrossAmount = 0;

    if (m.length >= 4) {
      lineVatAmount = m[2] ?? 0;
      lineGrossAmount = m[3] ?? (lineNetAmount + lineVatAmount);
    } else if (m.length === 3) {
      if ((m[2] ?? 0) > (lineNetAmount ?? 0)) {
        lineGrossAmount = m[2] ?? 0;
        lineVatAmount = Math.max(0, lineGrossAmount - lineNetAmount);
      } else {
        lineVatAmount = m[2] ?? 0;
        lineGrossAmount = (lineNetAmount ?? 0) + (lineVatAmount ?? 0);
      }
    } else {
      lineGrossAmount = lineNetAmount ?? 0;
      lineVatAmount = 0;
    }

    const isPromo = (lineNetAmount ?? 0) === 0 || (lineGrossAmount ?? 0) === 0;
    const lineType: LineType = isPromo ? "promotion" : "sale";

    let description = (descriptionBase || "").trim();
    if (!description) description = raw;

    items.push({
      description,
      units,
      unitNetPrice,
      lineNetAmount,
      vatRate,
      lineVatAmount,
      lineGrossAmount,
      lineType,
    });
  }

  return {
    items,
    hints: {
      headerFound: headerIdx >= 0,
      headerIdx,
      endIdx,
      tableLinesCount: tableLines.length,
      itemsFound: items.length,
      unmatchedPreview: unmatchedPreview.slice(0, 20),
      tablePreview: tableLines.slice(0, 40),
    },
  };
}

async function getOrCreateClientId(
  db: any,
  clientName: string | null,
  clientTaxId: string | null,
  delegateIdFromForm: string | null
) {
  const name = (clientName || "").trim() || "Cliente sin identificar";
  const tax = clientTaxId ? normalizeTaxId(clientTaxId) : null;

  // 1) por tax_id
  if (tax) {
    const { data: found, error: e1 } = await db.from("clients").select("id, delegate_id").eq("tax_id", tax).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (found?.id) {
      // si viene delegate_id y el cliente no lo tiene, lo ponemos
      if (delegateIdFromForm && !found.delegate_id) {
        await db.from("clients").update({ delegate_id: delegateIdFromForm }).eq("id", found.id);
      }
      return found.id as string;
    }
  }

  // 2) por nombre
  const { data: byName, error: e2 } = await db.from("clients").select("id, delegate_id").eq("name", name).maybeSingle();
  if (e2) throw new Error(e2.message);
  if (byName?.id) {
    if (delegateIdFromForm && !byName.delegate_id) {
      await db.from("clients").update({ delegate_id: delegateIdFromForm }).eq("id", byName.id);
    }
    return byName.id as string;
  }

  // 3) crear
  const { data: created, error: e3 } = await db
    .from("clients")
    .insert({ name, tax_id: tax, status: "active", delegate_id: delegateIdFromForm })
    .select("id")
    .single();
  if (e3) throw new Error(e3.message);
  return created.id as string;
}

async function getClientDelegateId(db: any, clientId: string): Promise<string | null> {
  const { data, error } = await db.from("clients").select("delegate_id").eq("id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.delegate_id ? String(data.delegate_id) : null;
}

async function findExistingInvoiceId(
  db: any,
  sourceFileHash: string,
  invoiceNumber: string | null,
  sourceProvider: string
): Promise<{ id: string | null; match: "hash" | "number" | null }> {
  const { data: ex1, error: e1 } = await db.from("invoices").select("id").eq("source_file_hash", sourceFileHash).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (ex1?.id) return { id: ex1.id as string, match: "hash" };

  if (invoiceNumber) {
    const { data: ex2, error: e2 } = await db
      .from("invoices")
      .select("id")
      .eq("invoice_number", invoiceNumber)
      .eq("source_provider", sourceProvider)
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    if (ex2?.id) return { id: ex2.id as string, match: "number" };
  }

  return { id: null, match: null };
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    stage = "auth_token";
    const token = getBearerToken(req);
    if (!token) return json(401, { ok: false, stage, error: "Falta Authorization Bearer token" });

    stage = "env";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon || !service) {
      return json(500, { ok: false, stage, error: "Faltan variables Supabase (URL/ANON/SERVICE_ROLE)" });
    }

    // 1) Validar usuario con token (ANON)
    stage = "auth_get_user";
    const supaAnon = createClient(url, anon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supaAnon.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json(401, { ok: false, stage, error: "Sesión inválida" });

    // 2) Service client
    stage = "service_client";
    const db = createClient(url, service, { auth: { persistSession: false } });

    // 3) Actor + RBAC
    stage = "actor_lookup";
    const { data: actor, error: actorErr } = await db
      .from("actors")
      .select("id, role, status, name, email, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (actorErr) return json(500, { ok: false, stage, error: actorErr.message });
    if (!actor?.id) return json(403, { ok: false, stage, error: "Actor no encontrado" });
    if (String(actor.status ?? "").toLowerCase() === "inactive") return json(403, { ok: false, stage, error: "Actor inactivo" });

    const role = String(actor.role ?? "").toLowerCase();
    const ALLOWED = new Set(["admin", "super_admin", "superadmin", "administrativo", "admin_operativo", "coordinador_comercial"]);
    if (!ALLOWED.has(role)) return json(403, { ok: false, stage: "authz", error: "Rol no autorizado", role });

    // 4) Inputs
    stage = "input";
    const formData = await req.formData();
    const month = String(formData.get("month") || "").trim();
    const file = formData.get("file");

    // nuevos campos (opcionales)
    const isPaidRaw = String(formData.get("is_paid") || "").trim().toLowerCase();
    const is_paid =
      isPaidRaw === "true" ? true : isPaidRaw === "false" ? false : null;

    const sourceChannelRaw = String(formData.get("source_channel") || "").trim().toLowerCase();
    const source_channel =
      sourceChannelRaw === "online" ? "online" : sourceChannelRaw === "offline" ? "offline" : null;

    const delegateIdRaw = String(formData.get("delegate_id") || "").trim();
    const delegate_id_from_form = delegateIdRaw && delegateIdRaw.length >= 10 ? delegateIdRaw : null;

    if (!month) return json(400, { ok: false, stage, error: "Falta month" });
    if (!(file instanceof File)) return json(400, { ok: false, stage, error: "Falta file" });

    // 5) PDF text
    stage = "pdf";
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    const { text, numpages, meta } = await extractPdfText(pdfBuffer);
    if (!text || text.trim().length < 20) {
      return json(422, { ok: false, stage: "parse", error: "No se pudo extraer texto del PDF", file_hash: fileHash });
    }

    // 6) Parse
    stage = "parse";
    const header = parseHeader(text);
    const parsedItems = parseItemsFromText(text);
    const items = parsedItems.items;
    const hints = parsedItems.hints;

    if (!items || items.length === 0) {
      return json(422, { ok: false, stage: "items", error: "No se han detectado líneas (items=0)", hints });
    }

    // 7) Source channel (por formulario o inferencia PDF)
    const inferred_channel = inferSourceChannelFromText(text);
    const final_source_channel = source_channel ?? inferred_channel;

    // 8) Cliente (y asignación a delegado si se pasó)
    stage = "client";
    const client_id = await getOrCreateClientId(db, header.clientName, header.clientTaxId, delegate_id_from_form);

    // 9) Delegate para la factura:
    // prioridad: form -> client.delegate_id -> null
    const client_delegate_id = await getClientDelegateId(db, client_id);
    const final_delegate_id = delegate_id_from_form ?? client_delegate_id ?? null;

    // 10) upsert factura
    stage = "invoice_lookup";
    const sourceProvider = "holded";
    const found = await findExistingInvoiceId(db, fileHash, header.invoiceNumber, sourceProvider);
    let invoiceId: string | null = found.id;

    // paid defaults
    const final_is_paid = is_paid ?? false;
    const final_paid_date = final_is_paid ? new Date().toISOString() : null;

    if (invoiceId) {
      stage = "invoice_update";
      await db.from("invoice_items").delete().eq("invoice_id", invoiceId);

      const upd: any = {
        client_id,
        delegate_id: final_delegate_id,
        invoice_number: header.invoiceNumber,
        invoice_date: header.invoiceDateISO,
        currency: "EUR",
        total_net: header.totalNet,
        total_vat: header.totalVat,
        total_gross: header.totalGross,
        is_paid: final_is_paid,
        paid_date: final_paid_date,
        source_month: month,
        source_provider: sourceProvider,
        source_filename: file.name,
        source_file_hash: fileHash,
        source_channel: final_source_channel,
        parse_status: {
          status: "parsed",
          confidence: 100,
          numpages,
          updated_from: found.match,
          updated_at: new Date().toISOString(),
        },
        parse_errors: null,
        source_meta: { meta, text_length: text.length, header, hints, inferred_channel },
        client_name: header.clientName,
      };

      const { error: updErr } = await db.from("invoices").update(upd).eq("id", invoiceId);
      if (updErr) return json(500, { ok: false, stage, error: updErr.message });
    }

    if (!invoiceId) {
      stage = "invoice_insert";
      const invoice_number = header.invoiceNumber ?? `UNKNOWN-${fileHash.slice(0, 10)}`;

      const payload: any = {
        client_id,
        delegate_id: final_delegate_id,
        invoice_number,
        invoice_date: header.invoiceDateISO,
        currency: "EUR",
        total_net: header.totalNet,
        total_vat: header.totalVat,
        total_gross: header.totalGross,
        is_paid: final_is_paid,
        paid_date: final_paid_date,
        pdf_path: null,
        source_month: month,
        source_provider: sourceProvider,
        source_filename: file.name,
        source_file_hash: fileHash,
        source_channel: final_source_channel,
        parse_status: { status: "parsed", confidence: 100, numpages, inserted_at: new Date().toISOString() },
        parse_errors: null,
        source_meta: { meta, text_length: text.length, header, hints, inferred_channel },
        client_name: header.clientName,
        created_at: new Date().toISOString(),
      };

      const { data: inv, error: invErr } = await db.from("invoices").insert(payload).select("id").single();
      if (invErr) return json(500, { ok: false, stage, error: invErr.message });
      invoiceId = inv.id as string;
    }

    // 11) items (nombres exactos)
    stage = "db_insert_items";
    const rows = items.map((it) => ({
      invoice_id: invoiceId,
      product_id: null,
      description: it.description,
      units: it.units,
      unit_net_price: it.unitNetPrice,
      line_net_amount: it.lineNetAmount,
      vat_rate: it.vatRate,
      line_vat_amount: it.lineVatAmount,
      line_gross_amount: it.lineGrossAmount,
      line_type: it.lineType,
      created_at: new Date().toISOString(),
    }));

    const { error: itemsErr } = await db.from("invoice_items").insert(rows);
    if (itemsErr) return json(500, { ok: false, stage, error: itemsErr.message });

    const saleUnits = items.filter((x) => x.lineType === "sale").reduce((acc, x) => acc + (x.units || 0), 0);
    const promoUnits = items.filter((x) => x.lineType === "promotion").reduce((acc, x) => acc + (x.units || 0), 0);

    return json(200, {
      ok: true,
      stage: found.id ? "updated" : "inserted",
      updated_from: found.match,
      actor: { id: actor.id, role: actor.role, name: actor.name ?? actor.email ?? "—" },
      invoice_id: invoiceId,
      file_hash: fileHash,
      numpages,
      source_channel: final_source_channel,
      is_paid: final_is_paid,
      delegate_id: final_delegate_id,
      client: { client_id, tax_id: header.clientTaxId, name: header.clientName },
      items: { count: items.length, saleUnits, promoUnits, paidUnits: saleUnits, freeUnits: promoUnits },
      hints,
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
