// src/app/api/holded/invoices/[id]/paid-check/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { holdedDocumentDetail, HoldedClientError } from "@/lib/holded/holdedClient";
import { computeCanonicalPaidState } from "@/lib/holded/holdedPaidState";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normalizeRole(role: any): string {
  return String(role ?? "").trim().toLowerCase();
}

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

export async function GET(req: Request, { params }: any) {
  let stage = "init";

  try {
    // 1) Auth + actor (admin only)
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

    // 2) Env (kept for observability / compatibility)
    stage = "env";
    const baseUrl = (process.env.HOLDED_BASE_URL ?? "https://api.holded.com").replace(/\/+$/, "");
    const docType = process.env.HOLDED_DOC_TYPE ?? "invoice";

    // 3) Params
    stage = "params";
    const id = String(params?.id ?? "").trim();
    if (!id) return json(400, { ok: false, stage, error: "Missing id param" });

    // 4) Fetch detail (CANONICAL CLIENT)
    stage = "fetch_holded_detail";
    let data: any = null;

    try {
      data = await holdedDocumentDetail<any>(docType, id);
    } catch (e: any) {
      if (e instanceof HoldedClientError) {
        return json(e.status ?? 500, {
          ok: false,
          stage,
          error: "HOLDed API error",
          http_status: e.status,
          url: `${baseUrl}/api/invoicing/v1/documents/${encodeURIComponent(docType)}/${encodeURIComponent(id)}`,
          sample: e.body ?? null,
        });
      }

      return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
    }

    // 5) Extract paid-related fields (sin inventar)
    stage = "extract";
    const total = toNumber(pick(data, ["total", "totalAmount", "total_amount", "gross", "amount"]));
    const paymentsTotal = toNumber(pick(data, ["paymentsTotal", "payments_total"]));
    const paymentsPending = toNumber(pick(data, ["paymentsPending", "payments_pending"]));
    const paymentsRefunds = toNumber(pick(data, ["paymentsRefunds", "payments_refunds"]));
    const status = pick(data, ["status", "state"]);
    const docNumber = pick(data, ["docNumber", "documentNumber", "invoiceNumber", "number", "num"]);
    const date = pick(data, ["date", "issueDate", "issue_date", "createdAt", "created_at"]);
    const draftRaw = pick(data, ["draft"]);
    const draft = typeof draftRaw === "boolean" ? draftRaw : null;

    // 6) Canonical paid engine
    stage = "compute_paid";
    const paid = computeCanonicalPaidState({
      total_gross: total,
      payments_total: paymentsTotal,
      payments_pending: paymentsPending,
      payments_refunds: paymentsRefunds,
      draft,
    });

    return json(200, {
      ok: true,
      stage: "ok",
      holded: { base_url: baseUrl, doc_type: docType, id },
      paid_check: {
        holded_id: pick(data, ["id", "_id"]) ?? id,
        doc_number: docNumber ?? null,
        date: date ?? null,
        status: status ?? null,
        draft: draftRaw ?? null,
        total: total,
        payments_total: paymentsTotal,
        payments_pending: paymentsPending,
        payments_refunds: paymentsRefunds,
        is_paid: paid.is_paid,
        rule: "is_paid = (payments_pending == 0) AND (payments_total >= total) AND (draft != true); null si faltan campos",
      },
      actor: { id: ar.actor?.id, role: roleRaw, name: ar.actor?.name ?? ar.actor?.email ?? "—" },
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}
