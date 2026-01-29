// src/app/api/delegate/orders/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

const ORDER_STATUSES = ["pending", "received", "prepared", "shipped", "delivered", "invoiced"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

function statusLabel(s: any) {
  const v = String(s ?? "").toLowerCase().trim();
  switch (v) {
    case "pending":
      return "Pendiente";
    case "received":
      return "Recibido";
    case "prepared":
      return "Preparado";
    case "shipped":
      return "Enviado";
    case "delivered":
      return "Entregado";
    case "invoiced":
      return "Facturado";
    default:
      return v || "—";
  }
}

function toInt(v: any, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

type CreateOrderBody = {
  client_id?: string;
  sale?: Array<{ product_id: string; units: number }>;
  foc?: Array<{ product_id: string; units: number }>;
  notes?: string | null;
};

async function sendOrderEmail(payload: {
  orderId: string;
  delegateId: string;
  actorName: string;
  client: { id: string; name: string; tax_id: string; contact_email?: string | null; contact_phone?: string | null };
  sale: Array<{ product_name: string; units: number }>;
  foc: Array<{ product_name: string; units: number }>;
  notes?: string | null;
}) {
  // Si no hay SMTP env, modo dev (no revienta)
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";
  const to = process.env.ORDER_EMAIL_TO ?? process.env.SMTP_TO ?? "";

  const subject = `Pedido Portal Delegado · ${payload.client.name} · ${payload.orderId}`;

  const lines: string[] = [];
  lines.push(`Pedido ID: ${payload.orderId}`);
  lines.push(`Delegate ID: ${payload.delegateId}`);
  lines.push(`Creado por: ${payload.actorName}`);
  lines.push("");
  lines.push(`Cliente: ${payload.client.name}`);
  lines.push(`NIF/CIF: ${payload.client.tax_id}`);
  lines.push(`Email: ${payload.client.contact_email ?? "-"}`);
  lines.push(`Tel: ${payload.client.contact_phone ?? "-"}`);
  lines.push("");
  lines.push("VENTA (uds):");
  if (!payload.sale.length) lines.push(" - (sin venta)");
  for (const it of payload.sale) lines.push(` - ${it.product_name}: ${it.units}`);
  lines.push("");
  lines.push("FOC (uds):");
  if (!payload.foc.length) lines.push(" - (sin FOC)");
  for (const it of payload.foc) lines.push(` - ${it.product_name}: ${it.units}`);
  lines.push("");
  if (payload.notes) {
    lines.push("Notas:");
    lines.push(String(payload.notes));
    lines.push("");
  }

  const text = lines.join("\n");

  // dev-mode: no SMTP configurado
  if (!host || !user || !pass || !from || !to) {
    console.log("[ORDER EMAIL - DEV MODE]\n", { to, from, subject, text });
    return { ok: true, dev: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({ to, from, subject, text });
  return { ok: true, dev: false };
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");
  const status = (url.searchParams.get("status") ?? "").trim();

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supa: r.supa,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    let q = r.supa
      .from("orders")
      .select("id, created_at, order_date, status, client_id, delegate_id, shipping_tracking_code, invoiced, paid, source")
      .eq("delegate_id", delegateId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return json(500, { ok: false, error: error.message });

    return NextResponse.json({ ok: true, items: data ?? [], delegateId, statuses: ORDER_STATUSES });
  } catch (e: any) {
    return json(403, { ok: false, error: e?.message ?? "Forbidden" });
  }
}

export async function POST(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");

  try {
    const delegateId = await resolveDelegateIdOrThrow({
      supa: r.supa,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
    });

    const body = (await req.json().catch(() => ({}))) as CreateOrderBody;

    const client_id = String(body?.client_id ?? "").trim();
    if (!client_id) return json(400, { ok: false, error: "client_id required" });

    const saleRaw = Array.isArray(body?.sale) ? body.sale : [];
    const focRaw = Array.isArray(body?.foc) ? body.foc : [];
    const notes = body?.notes ? String(body.notes) : null;

    const normalizeItems = (arr: Array<{ product_id: string; units: any }>) => {
      const out: Array<{ product_id: string; units: number }> = [];
      for (const it of arr ?? []) {
        const pid = String((it as any)?.product_id ?? "").trim();
        const u = toInt((it as any)?.units, 0);
        if (!pid) continue;
        if (u <= 0) continue;
        out.push({ product_id: pid, units: u });
      }
      return out;
    };

    const sale = normalizeItems(saleRaw as any);
    const foc = normalizeItems(focRaw as any);

    if (sale.length === 0 && foc.length === 0) {
      return json(400, { ok: false, error: "Debe haber al menos 1 item (venta o FOC)" });
    }

    // Cargar cliente (y verificar que exista)
    const { data: client, error: cErr } = await r.supa
      .from("clients")
      .select("id, name, tax_id, contact_email, contact_phone")
      .eq("id", client_id)
      .maybeSingle();

    if (cErr || !client) return json(400, { ok: false, error: "Client not found" });

    // Crear pedido
    const { data: order, error: oErr } = await r.supa
      .from("orders")
      .insert({
        delegate_id: delegateId,
        client_id,
        created_by_actor_id: r.actor.id,
        status: "pending" as OrderStatus,
        source: "portal",
      })
      .select("id, status, created_at")
      .single();

    if (oErr) return json(500, { ok: false, error: oErr.message });

    // Resolver nombres de producto (para email)
    const allPids = Array.from(new Set([...sale.map((x) => x.product_id), ...foc.map((x) => x.product_id)]));
    const nameById = new Map<string, string>();
    if (allPids.length) {
      const { data: prodRows } = await r.supa.from("products").select("id, name").in("id", allPids);
      for (const p of prodRows ?? []) nameById.set(String((p as any).id), String((p as any).name ?? "Producto"));
    }

    // Items: venta a precio ref (31) y FOC a 0
    const REF_PRICE = 31;

    const itemsToInsert = [
      ...sale.map((x) => ({ order_id: order.id, product_id: x.product_id, units: x.units, unit_price: REF_PRICE })),
      ...foc.map((x) => ({ order_id: order.id, product_id: x.product_id, units: x.units, unit_price: 0 })),
    ];

    const { error: iErr } = await r.supa.from("order_items").insert(itemsToInsert);
    if (iErr) return json(500, { ok: false, error: iErr.message });

    // Email (no bloquea el pedido si falla)
    let emailRes: any = null;
    try {
      emailRes = await sendOrderEmail({
        orderId: order.id,
        delegateId,
        actorName: (r.actor as any).name ?? r.actor.id,
        client: {
          id: String(client.id),
          name: String((client as any).name ?? "—"),
          tax_id: String((client as any).tax_id ?? "—"),
          contact_email: (client as any).contact_email ?? null,
          contact_phone: (client as any).contact_phone ?? null,
        },
        sale: sale.map((x) => ({ product_name: nameById.get(x.product_id) ?? "Producto", units: x.units })),
        foc: foc.map((x) => ({ product_name: nameById.get(x.product_id) ?? "Producto", units: x.units })),
        notes,
      });
    } catch (e: any) {
      emailRes = { ok: false, error: e?.message ?? "Email failed" };
    }

    return NextResponse.json({
      ok: true,
      order: { id: order.id, status: statusLabel(order.status) },
      email: emailRes,
    });
  } catch (e: any) {
    return json(403, { ok: false, error: e?.message ?? "Forbidden" });
  }
}
