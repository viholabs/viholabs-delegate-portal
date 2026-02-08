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
 * Auditoria mínima (no rompe):
 * - Intenta escribir en una tabla llamada "audit_log".
 * - Si la tabla no existe o falla, NO rompe el endpoint (warning silencioso).
 *
 * Esquema esperado (flexible):
 * - action: text
 * - actor_id: uuid/text
 * - status: text ("ok"|"error")
 * - meta: jsonb (month, channel, duration_ms, etc.)
 * - error_message: text nullable
 * - created_at: default now()
 */
async function tryAuditLog(
  supaService: any,
  payload: {
    action: string;
    actor_id: string;
    status: "ok" | "error";
    meta: any;
    error_message?: string | null;
  }
): Promise<{ ok: boolean; warning?: string }> {
  try {
    const { error } = await supaService.from("audit_log").insert({
      action: payload.action,
      actor_id: payload.actor_id,
      status: payload.status,
      meta: payload.meta,
      error_message: payload.error_message ?? null,
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
  let auditWarning: string | null = null;

  // Variables que queremos dejar trazadas
  let auditActorId: string | null = null;
  let auditMonth: string | null = null;
  let auditChannel: string | null = null;

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

    if (actor?.status === "inactive") {
      return json(403, {
        ok: false,
        stage: `${stageBase}:actor`,
        error: "Actor inactivo",
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
      return json(422, {
        ok: false,
        stage: `${stageBase}:${stage}`,
        error: "month inválido (YYYY-MM-01)",
      });
    }

    // 3) Permisos efectivos (canónico Control Room)
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin || eff.has("commissions.recalc") || eff.has("commissions.manage");

    if (!allowed) {
      // Intento auditar denegación (sin romper)
      const durationMs = Date.now() - startedAt;
      const a = await tryAuditLog(supaService, {
        action: "commissions.recalc",
        actor_id: String(actor.id),
        status: "error",
        meta: {
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
        ...(auditWarning ? { warning: auditWarning } : {}),
      });
    }

    // 4) RPC recalc (SERVICE ROLE, bypass RLS)
    stage = "rpc_recalc";
    const { error: rpcErr } = await supaService.rpc("recalc_commissions_month", {
      p_month: month,
      p_channel: channel,
    });

    if (rpcErr) {
      // Auditar error RPC (sin romper)
      const durationMs = Date.now() - startedAt;
      const a = await tryAuditLog(supaService, {
        action: "commissions.recalc",
        actor_id: String(actor.id),
        status: "error",
        meta: {
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
        ...(auditWarning ? { warning: auditWarning } : {}),
      });
    }

    // 5) KPI (opcional; si falla, no rompe el recalculo)
    stage = "rpc_kpi";
    const { data: kpi, error: kpiErr } = await supaService.rpc("kpi_global", {
      p_period: "month",
      p_anchor: month,
    });

    // Auditar OK (aunque el KPI falle, el recalculo ya fue OK)
    const durationMs = Date.now() - startedAt;
    const a = await tryAuditLog(supaService, {
      action: "commissions.recalc",
      actor_id: String(actor.id),
      status: "ok",
      meta: {
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
    // Intento auditar excepción (si tenemos supaService via getActorFromRequest, no lo tenemos aquí)
    // No rompemos nada por auditoría.
    return json(500, {
      ok: false,
      stage: `${stageBase}:unhandled:${stage}`,
      error: e?.message ?? "Unknown error",
      meta: {
        actor_id: auditActorId,
        month: auditMonth,
        channel: auditChannel,
      },
    });
  }
}
