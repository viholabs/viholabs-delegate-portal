// src/app/api/control-room/el-elyon/invoices/actor-override/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

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
  supaRls: any;
  supaService?: any;
};

type ActorFromRequestFail = {
  ok: false;
  status: number;
  error: string;
};

type InvoiceExistsRow = {
  id: string;
  client_id: string | null;
  invoice_number: string | null;
};

type InvoiceActorAssignmentRow = {
  id: string;
  invoice_id: string;
  role:
    | "COORDINATOR_COMMERCIAL"
    | "COORDINATOR_CECT"
    | "RECOMMENDER"
    | "COMMISSIONIST_1"
    | "COMMISSIONIST_2"
    | "COMMISSIONIST_3"
    | "COMMISSIONIST_4"
    | "COMMISSIONIST_5"
    | "AFFILIATE"
    | "DELEGATE"
    | null;
  actor_id: string | null;
  apply_to_client: boolean | null;
  created_at: string | null;
  created_by: string | null;
  state_code: string | null;
};

type InvoiceAffiliateAssignmentRow = {
  id: string;
  invoice_id: string;
  affiliate_account_id: string | null;
  apply_to_client: boolean | null;
  created_at: string | null;
  created_by: string | null;
  state_code: string | null;
};

type Body = {
  invoice_id?: string;
  target?: "DELEGATE" | "RECOMMENDER" | "AFFILIATE";
  actor_id?: string | null;
  affiliate_account_id?: string | null;
  mode?: "set" | "clear";
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function isOk(ar: unknown): ar is ActorFromRequestOk {
  if (!ar || typeof ar !== "object") return false;

  const v = ar as {
    ok?: unknown;
    actor?: { id?: unknown } | null;
    supaService?: unknown;
  };

  return v.ok === true && typeof v.actor?.id === "string" && !!v.supaService;
}

function safeId(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeTarget(value: unknown): Body["target"] | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "DELEGATE") return "DELEGATE";
  if (v === "RECOMMENDER") return "RECOMMENDER";
  if (v === "AFFILIATE") return "AFFILIATE";
  return null;
}

function normalizeMode(value: unknown): "set" | "clear" {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "clear" ? "clear" : "set";
}

async function readBody(req: NextRequest): Promise<Body> {
  try {
    return (await req.json()) as Body;
  } catch {
    return {};
  }
}

async function requireInvoice(
  supaService: any,
  invoiceId: string,
): Promise<InvoiceExistsRow> {
  const { data, error } = await supaService
    .from("invoices")
    .select("id, client_id, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    throw new Error(`invoices(require): ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Factura no encontrada");
  }

  return data as InvoiceExistsRow;
}

async function requireActorExists(
  supaService: any,
  actorId: string,
): Promise<void> {
  const { data, error } = await supaService
    .from("actors")
    .select("id")
    .eq("id", actorId)
    .eq("state_code", "OPEN")
    .maybeSingle();

  if (error) {
    throw new Error(`actors(require): ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Actor no encontrado o no abierto");
  }
}

async function requireAffiliateExists(
  supaService: any,
  affiliateAccountId: string,
): Promise<void> {
  const { data, error } = await supaService
    .from("affiliate_accounts")
    .select("id")
    .eq("id", affiliateAccountId)
    .eq("state_code", "OPEN")
    .maybeSingle();

  if (error) {
    throw new Error(`affiliate_accounts(require): ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Afiliado no encontrado o no abierto");
  }
}

async function loadOpenActorAssignments(
  supaService: any,
  invoiceId: string,
  role: "DELEGATE" | "RECOMMENDER",
): Promise<InvoiceActorAssignmentRow[]> {
  const { data, error } = await supaService
    .from("invoice_actor_assignments")
    .select("id, invoice_id, role, actor_id, apply_to_client, created_at, created_by, state_code")
    .eq("invoice_id", invoiceId)
    .eq("role", role)
    .eq("state_code", "OPEN")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`invoice_actor_assignments(load): ${error.message}`);
  }

  return (data ?? []) as InvoiceActorAssignmentRow[];
}

async function loadOpenAffiliateAssignments(
  supaService: any,
  invoiceId: string,
): Promise<InvoiceAffiliateAssignmentRow[]> {
  const { data, error } = await supaService
    .from("invoice_affiliate_assignments")
    .select("id, invoice_id, affiliate_account_id, apply_to_client, created_at, created_by, state_code")
    .eq("invoice_id", invoiceId)
    .eq("state_code", "OPEN")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`invoice_affiliate_assignments(load): ${error.message}`);
  }

  return (data ?? []) as InvoiceAffiliateAssignmentRow[];
}

async function closeActorAssignments(
  supaService: any,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supaService
    .from("invoice_actor_assignments")
    .update({ state_code: "CLOSED" })
    .in("id", ids);

  if (error) {
    throw new Error(`invoice_actor_assignments(close): ${error.message}`);
  }
}

async function closeAffiliateAssignments(
  supaService: any,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supaService
    .from("invoice_affiliate_assignments")
    .update({ state_code: "CLOSED" })
    .in("id", ids);

  if (error) {
    throw new Error(`invoice_affiliate_assignments(close): ${error.message}`);
  }
}

async function insertActorAssignment(args: {
  supaService: any;
  invoiceId: string;
  role: "DELEGATE" | "RECOMMENDER";
  actorId: string;
  createdBy: string;
}) {
  const { supaService, invoiceId, role, actorId, createdBy } = args;

  const payload = {
    invoice_id: invoiceId,
    role,
    actor_id: actorId,
    apply_to_client: false,
    created_by: createdBy,
    state_code: "OPEN",
  };

  const { data, error } = await supaService
    .from("invoice_actor_assignments")
    .insert(payload)
    .select("id, invoice_id, role, actor_id, apply_to_client, created_at, created_by, state_code")
    .single();

  if (error) {
    throw new Error(`invoice_actor_assignments(insert): ${error.message}`);
  }

  return data as InvoiceActorAssignmentRow;
}

async function insertAffiliateAssignment(args: {
  supaService: any;
  invoiceId: string;
  affiliateAccountId: string;
  createdBy: string;
}) {
  const { supaService, invoiceId, affiliateAccountId, createdBy } = args;

  const payload = {
    invoice_id: invoiceId,
    affiliate_account_id: affiliateAccountId,
    apply_to_client: false,
    created_by: createdBy,
    state_code: "OPEN",
  };

  const { data, error } = await supaService
    .from("invoice_affiliate_assignments")
    .insert(payload)
    .select("id, invoice_id, affiliate_account_id, apply_to_client, created_at, created_by, state_code")
    .single();

  if (error) {
    throw new Error(`invoice_affiliate_assignments(insert): ${error.message}`);
  }

  return data as InvoiceAffiliateAssignmentRow;
}

async function insertInvoiceAuditLog(args: {
  supaService: any;
  invoiceId: string;
  actorId: string;
  action: string;
}) {
  const { supaService, invoiceId, actorId, action } = args;

  const payload = {
    invoice_id: invoiceId,
    action,
    actor: actorId,
  };

  const { error } = await supaService.from("invoice_audit_log").insert(payload);

  if (error) {
    throw new Error(`invoice_audit_log(insert): ${error.message}`);
  }
}

function sameNullable(a: string | null, b: string | null): boolean {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

export async function POST(req: NextRequest) {
  let stage = "init";

  try {
    stage = "actor_from_request";
    const ar = (await getActorFromRequest(req)) as
      | ActorFromRequestOk
      | ActorFromRequestFail
      | unknown;

    if (!isOk(ar)) {
      const fail = ar as ActorFromRequestFail | undefined;
      return json(fail?.status ?? 401, {
        ok: false,
        stage,
        error: fail?.error ?? "No autenticado",
      });
    }

    const currentActorId = String(ar.actor.id);

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(currentActorId);

    const canManage =
      eff.isSuperAdmin ||
      eff.has("invoices.manage") ||
      eff.has("control_room.invoices.manage") ||
      eff.has("actors.read");

    if (!canManage) {
      return json(403, {
        ok: false,
        stage: "authorize",
        error: "No autorizado para editar overrides de factura",
      });
    }

    stage = "body";
    const body = await readBody(req);

    const invoiceId = safeId(body.invoice_id);
    const target = normalizeTarget(body.target);
    const mode = normalizeMode(body.mode);

    if (!invoiceId) {
      return json(400, {
        ok: false,
        stage,
        error: "invoice_id es obligatorio",
      });
    }

    if (!target) {
      return json(400, {
        ok: false,
        stage,
        error: "target inválido. Usa DELEGATE, RECOMMENDER o AFFILIATE",
      });
    }

    stage = "require_invoice";
    const invoice = await requireInvoice(ar.supaService, invoiceId);

    if (target === "DELEGATE" || target === "RECOMMENDER") {
      stage = "load_current_actor_overrides";
      const openRows = await loadOpenActorAssignments(
        ar.supaService,
        invoiceId,
        target,
      );

      const currentOpen = openRows[0] ?? null;
      const nextActorId = mode === "clear" ? null : safeId(body.actor_id);

      if (mode === "set" && !nextActorId) {
        return json(400, {
          ok: false,
          stage,
          error: "actor_id es obligatorio para mode=set",
        });
      }

      if (nextActorId) {
        stage = "require_actor";
        await requireActorExists(ar.supaService, nextActorId);
      }

      if (sameNullable(currentOpen?.actor_id ?? null, nextActorId)) {
        return json(200, {
          ok: true,
          changed: false,
          target,
          mode,
          invoice: {
            id: invoice.id,
            invoice_number: invoice.invoice_number ?? null,
            client_id: invoice.client_id ?? null,
          },
          current_assignment_id: currentOpen?.id ?? null,
          message: "Sin cambios",
        });
      }

      stage = "close_old_actor_overrides";
      await closeActorAssignments(
        ar.supaService,
        openRows.map((row) => row.id),
      );

      let created: InvoiceActorAssignmentRow | null = null;

      if (nextActorId) {
        stage = "insert_new_actor_override";
        created = await insertActorAssignment({
          supaService: ar.supaService,
          invoiceId,
          role: target,
          actorId: nextActorId,
          createdBy: currentActorId,
        });
      }

      stage = "audit_actor_override";
      await insertInvoiceAuditLog({
        supaService: ar.supaService,
        invoiceId,
        actorId: currentActorId,
        action: JSON.stringify({
          origin: "el_elyon_manual_override",
          kind: "invoice_actor_override",
          target,
          mode,
          previous_actor_id: currentOpen?.actor_id ?? null,
          new_actor_id: nextActorId,
          closed_assignment_ids: openRows.map((row) => row.id),
          created_assignment_id: created?.id ?? null,
        }),
      });

      return json(200, {
        ok: true,
        changed: true,
        target,
        mode,
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number ?? null,
          client_id: invoice.client_id ?? null,
        },
        previous_assignment_ids: openRows.map((row) => row.id),
        created_assignment_id: created?.id ?? null,
        value: {
          actor_id: nextActorId,
        },
      });
    }

    stage = "load_current_affiliate_overrides";
    const openAffiliateRows = await loadOpenAffiliateAssignments(
      ar.supaService,
      invoiceId,
    );

    const currentOpenAffiliate = openAffiliateRows[0] ?? null;
    const nextAffiliateId =
      mode === "clear" ? null : safeId(body.affiliate_account_id);

    if (mode === "set" && !nextAffiliateId) {
      return json(400, {
        ok: false,
        stage,
        error: "affiliate_account_id es obligatorio para mode=set",
      });
    }

    if (nextAffiliateId) {
      stage = "require_affiliate";
      await requireAffiliateExists(ar.supaService, nextAffiliateId);
    }

    if (
      sameNullable(
        currentOpenAffiliate?.affiliate_account_id ?? null,
        nextAffiliateId,
      )
    ) {
      return json(200, {
        ok: true,
        changed: false,
        target,
        mode,
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number ?? null,
          client_id: invoice.client_id ?? null,
        },
        current_assignment_id: currentOpenAffiliate?.id ?? null,
        message: "Sin cambios",
      });
    }

    stage = "close_old_affiliate_overrides";
    await closeAffiliateAssignments(
      ar.supaService,
      openAffiliateRows.map((row) => row.id),
    );

    let createdAffiliate: InvoiceAffiliateAssignmentRow | null = null;

    if (nextAffiliateId) {
      stage = "insert_new_affiliate_override";
      createdAffiliate = await insertAffiliateAssignment({
        supaService: ar.supaService,
        invoiceId,
        affiliateAccountId: nextAffiliateId,
        createdBy: currentActorId,
      });
    }

    stage = "audit_affiliate_override";
    await insertInvoiceAuditLog({
      supaService: ar.supaService,
      invoiceId,
      actorId: currentActorId,
      action: JSON.stringify({
        origin: "el_elyon_manual_override",
        kind: "invoice_affiliate_override",
        target: "AFFILIATE",
        mode,
        previous_affiliate_account_id:
          currentOpenAffiliate?.affiliate_account_id ?? null,
        new_affiliate_account_id: nextAffiliateId,
        closed_assignment_ids: openAffiliateRows.map((row) => row.id),
        created_assignment_id: createdAffiliate?.id ?? null,
      }),
    });

    return json(200, {
      ok: true,
      changed: true,
      target: "AFFILIATE",
      mode,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number ?? null,
        client_id: invoice.client_id ?? null,
      },
      previous_assignment_ids: openAffiliateRows.map((row) => row.id),
      created_assignment_id: createdAffiliate?.id ?? null,
      value: {
        affiliate_account_id: nextAffiliateId,
      },
    });
  } catch (err) {
    return json(500, {
      ok: false,
      stage,
      error: err instanceof Error ? err.message : "Error inesperado",
    });
  }
}