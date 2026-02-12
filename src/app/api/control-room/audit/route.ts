// src/app/api/control-room/audit/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type ActorLite = {
  id: string;
  role: string | null;
  status?: string | null;
  name?: string | null;
  email?: string | null;
};

type ActorFromRequestOk = {
  ok: true;
  actor: ActorLite;
  supaService: any;
  supaRls: any;
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor && !!ar.supaService;
}

function pickInvoiceNumberFromMeta(meta: any): string | null {
  if (!meta) return null;

  const direct =
    meta.invoice_number ??
    meta.invoiceNumber ??
    meta.invoice_no ??
    meta.invoiceNo ??
    meta.number ??
    meta.invoice?.invoice_number ??
    meta.invoice?.number ??
    meta.invoice?.invoice_no;

  const s = String(direct ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Intentem resoldre invoice_number via taula invoices, sense assumir el nom de columna.
 * Provem variants: invoice_number, invoice_no, number.
 * Si falla, retornem map buit (mai trenquem).
 */
async function resolveInvoiceNumbersByIds(
  supaService: any,
  invoiceIds: string[]
): Promise<Record<string, string>> {
  if (invoiceIds.length === 0) return {};

  const candidates = ["invoice_number", "invoice_no", "number"];
  for (const col of candidates) {
    try {
      const sel = `id,${col}`;
      const { data, error } = await supaService
        .from("invoices")
        .select(sel)
        .in("id", invoiceIds);

      if (error) {
        // si és error de columna, provem següent; si és qualsevol altre, també provem següent sense trencar
        continue;
      }

      const map: Record<string, string> = {};
      for (const r of data ?? []) {
        const v = String((r as any)[col] ?? "").trim();
        if (v) map[String((r as any).id)] = v;
      }
      return map;
    } catch {
      // provem següent
      continue;
    }
  }

  return {};
}

export async function GET(req: Request) {
  const stageBase = "api/control-room/audit";
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!isOk(ar)) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage,
        error: ar?.error ?? "No autenticado",
      });
    }

    const actor = ar.actor;
    const supaService = ar.supaService;

    if (actor?.status === "inactive") {
      return json(403, { ok: false, stage, error: "Actor inactivo" });
    }

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("audit.read") ||
      eff.has("control_room.audit.read") ||
      eff.has("actors.manage");

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (audit.read)",
      });
    }

    // 1) Llegim audit_log (INCLÒS entity_id!)
    stage = "audit_select";
    const { data: rows, error } = await supaService
      .from("audit_log")
      .select("id, created_at, action, status, entity, entity_id, actor_id, meta, state_code")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return json(500, { ok: false, stage, error: error.message });
    }

    const safeRows = (rows ?? []) as any[];

    // 2) Resolve actors (labels)
    const actorIds = Array.from(new Set(safeRows.map((r) => r.actor_id).filter(Boolean)));
    let actorsMap: Record<string, string> = {};

    if (actorIds.length > 0) {
      stage = "actors_select";
      const { data: actors } = await supaService.from("actors").select("id, name, email").in("id", actorIds);
      for (const a of actors ?? []) {
        actorsMap[a.id] = a.name || a.email || a.id;
      }
    }

    // 3) Resolve invoice numbers quan entity='invoice' i entity_id existeix
    const invoiceIds = Array.from(
      new Set(
        safeRows
          .filter((r) => String(r.entity ?? "") === "invoice" && !!r.entity_id)
          .map((r) => String(r.entity_id))
      )
    );

    stage = "invoices_resolve";
    const invoiceMap = await resolveInvoiceNumbersByIds(supaService, invoiceIds);

    // 4) Enrich
    const enriched = safeRows.map((r) => {
      const metaInvoice = pickInvoiceNumberFromMeta(r.meta);
      const entityInvoice =
        String(r.entity ?? "") === "invoice" && r.entity_id ? invoiceMap[String(r.entity_id)] ?? null : null;

      return {
        ...r,
        actor_label: r.actor_id ? actorsMap[r.actor_id] ?? r.actor_id : "—",
        invoice_number: metaInvoice ?? entityInvoice ?? null,
      };
    });

    return json(200, { ok: true, rows: enriched });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage: `${stageBase}:unhandled:${stage}`,
      error: e?.message ?? "Unknown error",
    });
  }
}
