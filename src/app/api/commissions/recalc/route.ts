// src/app/api/commissions/recalc/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isValidMonthYYYYMM01(value: string) {
  return /^\d{4}-\d{2}-01$/.test(value);
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
  supaService: any; // service role
  supaRls: any; // RLS client
};

function isOk(ar: any): ar is ActorFromRequestOk {
  return !!ar && ar.ok === true && !!ar.actor && !!ar.supaService && !!ar.supaRls;
}

/**
 * Auditoria mínima (NO rompe), adaptada a l'esquema real de public.audit_log:
 * columns: id, created_at, user_id, actor_id, action, entity, entity_id, status, meta, state_code
 *
 * Guardem errors dins meta.error (NO existeix columna error_message).
 */
async function tryAuditLog(
  supaService: any,
  payload: {
    action: string;
    actor_id: string | null;
    status: "ok" | "error";
    meta: any;
    error_message?: string | null;
  }
): Promise<{ ok: boolean; warning?: string }> {
  try {
    const meta = {
      ...(payload.meta ?? {}),
      ...(payload.error_message ? { error: payload.error_message } : {}),
    };

    const { error } = await supaService.from("audit_log").insert({
      action: payload.action,
      actor_id: payload.actor_id,
      status: payload.status,
      meta,
      entity: "commissions_recalc",
      entity_id: null,
      state_code: "OPEN",
      user_id: null,
    });

    if (error) return { ok: false, warning: `audit_log insert failed: ${error.message}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, warning: `audit_log insert exception: ${e?.message ?? String(e)}` };
  }
}

export async function POST(req: Request) {
  const stageBase = "api/commissions/recalc";
  let stage = "init";

  const startedAt = Date.now();
  const request_id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let auditWarning: string | null = null;

  // Variables que queremos dejar trazadas
  let auditActorId: string | null = null;
  let auditMonth: string | null = null;
  let auditChannel: string | null = null;

  // 🔒 AUDIT START (obligatori, NO trenca mai)
  // Encara no tenim actor; ho deixem a null i actualitzarem després.
  // IMPORTANT: no pot bloquejar el flux; si falla, el warning queda silenciós.
  // Aquí no tenim supaService encara; el tindrem després de getActorFromRequest.
  // Per tant, fem AUDIT START tan aviat com tinguem ar.supaService.

  try {
    // 1) Auth + actor + clients (canónico del repo)
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!isOk(ar)) {
      return json(ar?.status ?? 401, {
        ok: false,
        stage: `${stageBase}:${stage}`,
        error: ar?.error ?? "No autenticado",
      });
    }

    const actor = ar.actor;
    const supaService = ar.supaService;

    auditActorId = String(actor.id);

    // ✅ AUDIT START (ara sí: ja tenim supaService)
    {
      const a = await tryAuditLog(supaService, {
        action: "commissions.recalc",
        actor_id: auditActorId,
        status: "ok",
        meta: {
          phase: "start",
          request_id,
          stage: "actor_from_request",
          duration_ms: 0,
        },
        error_message: null,
      });
      if (!a.ok) auditWarning = a.warning ?? null;
    }

    if (actor?.status === "inactive") {
      // audit end (error)
      const durationMs = Date.now() - startedAt;
      const a = await tryAuditLog(supaService, {
        action: "commissions.recalc",
        actor_id: auditActorId,
        status: "error",
        meta: {
          phase: "end",
          request_id,
          stage: "actor",
          duration_ms: durationMs,
        },
        error_message: "Actor inactivo",
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return json(403, {
        ok: false,
        stage: `${stageBase}:actor`,
        error: "Actor inactivo",
        ...(auditWarning ? { audit_warning: auditWarning } : {}),
      });
    }

    // 2) Input
    stage = "input";
    const body = await req.json().catch(() => null);
    const month = String(body?.month ?? "");
    const channel = String(body?.channel ?? "pdv");

    auditMonth = month;
    auditChannel = channel;

    if (!isValidMonthYYYYMM01(month)) {
      const durationMs = Date.now() - startedAt;
      const a = await tryAuditLog(supaService, {
        action: "commissions.recalc",
        actor_id: auditActorId,
        status: "error",
        meta: {
          phase: "end",
          request_id,
          month,
          channel,
          duration_ms: durationMs,
          stage: "input",
        },
        error_message: "month inválido (YYYY-MM-01)",
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return json(422, {
        ok: false,
        stage: `${stageBase}:${stage}`,
        error: "month inválido (YYYY-MM-01)",
        ...(auditWarning ? { audit_warning: auditWarning } : {}),
      });
    }

    // 3) Permisos efectivos (canónico Control Room)
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin || eff.has("commissions.recalc") || eff.has("commissions.manage");

    if (!allowed) {
      const durationMs = Date.now() - startedAt;
      const a = await tryAuditLog(supaService, {
        action: "commissions.recalc",
        actor_id: auditActorId,
        status: "error",
        meta: {
          phase: "end",
          request_id,
          month,
          channel,
          duration_ms: durationMs,
          stage: "authorize",
          role: actor.role,
        },
        error_message: "Forbidden: Rol no autorizado",
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return json(403, {
        ok: false,
        stage: `${stageBase}:${stage}`,
        error: "Rol no autorizado",
        role: actor.role,
        ...(auditWarning ? { audit_warning: auditWarning } : {}),
      });
    }

    // 4) RPC recalc (SERVICE ROLE, bypass RLS)
    stage = "rpc_recalc";
    const { error: rpcErr } = await supaService.rpc("recalc_commissions_month", {
      p_month: month,
      p_channel: channel,
    });

    if (rpcErr) {
      const durationMs = Date.now() - startedAt;
      const a = await tryAuditLog(supaService, {
        action: "commissions.recalc",
        actor_id: auditActorId,
        status: "error",
        meta: {
          phase: "end",
          request_id,
          month,
          channel,
          duration_ms: durationMs,
          stage: "rpc_recalc",
        },
        error_message: rpcErr.message,
      });
      if (!a.ok) auditWarning = a.warning ?? null;

      return json(500, {
        ok: false,
        stage: `${stageBase}:${stage}`,
        error: rpcErr.message,
        ...(auditWarning ? { audit_warning: auditWarning } : {}),
      });
    }

    // 5) KPI (opcional; si falla, no rompe el recalculo)
    stage = "rpc_kpi";
    const { data: kpi, error: kpiErr } = await supaService.rpc("kpi_global", {
      p_period: "month",
      p_anchor: month,
    });

    // AUDIT END (OK, encara que KPI falli)
    const durationMs = Date.now() - startedAt;
    const a = await tryAuditLog(supaService, {
      action: "commissions.recalc",
      actor_id: auditActorId,
      status: "ok",
      meta: {
        phase: "end",
        request_id,
        month,
        channel,
        duration_ms: durationMs,
        stage: kpiErr ? "rpc_kpi_warning" : "done",
        kpi_warning: kpiErr ? kpiErr.message : null,
      },
      error_message: null,
    });
    if (!a.ok) auditWarning = a.warning ?? null;

    if (kpiErr) {
      return json(200, {
        ok: true,
        month,
        channel,
        actor: { id: actor.id, role: actor.role, name: actor.name ?? actor.email ?? "—" },
        kpi: null,
        warning: `kpi_global failed: ${kpiErr.message}`,
        ...(auditWarning ? { audit_warning: auditWarning } : {}),
      });
    }

    return json(200, {
      ok: true,
      month,
      channel,
      actor: { id: actor.id, role: actor.role, name: actor.name ?? actor.email ?? "—" },
      kpi: (kpi as any)?.[0] ?? null,
      ...(auditWarning ? { audit_warning: auditWarning } : {}),
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage: `${stageBase}:unhandled:${stage}`,
      error: e?.message ?? "Unknown error",
      meta: {
        request_id,
        actor_id: auditActorId,
        month: auditMonth,
        channel: auditChannel,
      },
    });
  }
}
