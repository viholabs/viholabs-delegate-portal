// src/app/api/control-room/tech/logs/latest/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Severity = "INFO" | "WARN" | "CRITICAL";
type SubsystemKey = "holded" | "shopify" | "bixgrow" | "commissions";

type LogItem = {
  at: string;
  message: string;
  severity: Severity;
};

function norm(v: any) {
  return String(v ?? "").trim();
}

function severityFromStatus(status: any): Severity {
  const s = norm(status).toLowerCase();
  if (!s) return "INFO";
  if (s.includes("error") || s.includes("fail") || s.includes("critical")) return "CRITICAL";
  if (s.includes("warn") || s.includes("warning") || s.includes("degraded")) return "WARN";
  return "INFO";
}

// Format humà (no ISO). Minimal i estable.
function formatAt(dt: string | null): string {
  if (!dt) return "—";
  try {
    const d = new Date(dt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "—";
  }
}

function subsystemFromRow(r: any): SubsystemKey | null {
  const entity = norm(r?.entity).toLowerCase();
  const action = norm(r?.action).toLowerCase();

  // Map mínim basat en camps reals audit_log (sense inventar taules)
  if (entity === "invoice" || entity === "invoices" || action.includes("invoice")) return "holded";
  if (entity.includes("shopify") || action.includes("shopify") || action.includes("kpi")) return "shopify";
  if (entity.includes("affiliate") || action.includes("affiliate") || action.includes("bixgrow") || action.includes("attribution"))
    return "bixgrow";
  if (entity.includes("commission") || action.includes("commission") || action.includes("recalc")) return "commissions";

  return null;
}

function messageFromRow(r: any): string {
  const action = norm(r?.action);
  const entity = norm(r?.entity);
  const status = norm(r?.status);
  const state = norm(r?.state_code);

  const base = action
    ? action.replace(/[_\-]+/g, " ").trim()
    : entity
      ? `Activitat ${entity}`
      : "Activitat registrada";

  const extras: string[] = [];
  if (status) extras.push(status);
  if (state) extras.push(state);

  return extras.length ? `${base} · ${extras.join(" · ")}` : base;
}

function isRecent(createdAt: any, windowHours: number): boolean {
  const v = norm(createdAt);
  if (!v) return false;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return false;
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  return t >= cutoff;
}

function stableKey(r: any): string {
  // Dedupe canònic: mateixa activitat i mateix estat → una sola incidència
  const action = norm(r?.action).toUpperCase();
  const entity = norm(r?.entity).toUpperCase();
  const status = norm(r?.status).toUpperCase();
  const state = norm(r?.state_code).toUpperCase();
  return `${action}|${entity}|${status}|${state}`;
}

export async function GET(req: Request) {
  const stageBase = "api/control-room/tech/logs/latest";
  let stage = "init";

  // Anti-ruïna històrica: només incidències recents (MVP)
  const WINDOW_HOURS = 24;

  try {
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!ar?.ok || !ar?.actor || !ar?.supaService) {
      return json(ar?.status ?? 401, { ok: false, stage, error: ar?.error ?? "No autenticado" });
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
      return json(403, { ok: false, stage, error: "No autorizado (audit.read)" });
    }

    stage = "audit_select";
    const { data, error } = await supaService
      .from("audit_log")
      .select("id, created_at, action, status, entity, state_code")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return json(500, { ok: false, stage, error: error.message });
    }

    const out: Record<SubsystemKey, LogItem[]> = {
      holded: [],
      shopify: [],
      bixgrow: [],
      commissions: [],
    };

    const seen: Record<SubsystemKey, Set<string>> = {
      holded: new Set(),
      shopify: new Set(),
      bixgrow: new Set(),
      commissions: new Set(),
    };

    for (const r of (data ?? []) as any[]) {
      // 1) Recència
      if (!isRecent(r?.created_at, WINDOW_HOURS)) continue;

      const key = subsystemFromRow(r);
      if (!key) continue;

      // 2) Dedupe
      const k = stableKey(r);
      if (seen[key].has(k)) continue;
      seen[key].add(k);

      out[key].push({
        at: formatAt(r?.created_at ?? null),
        severity: severityFromStatus(r?.status),
        message: messageFromRow(r),
      });
    }

    (Object.keys(out) as SubsystemKey[]).forEach((k) => {
      out[k] = out[k].slice(0, 5);
    });

    return json(200, { ok: true, logs: out, meta: { window_hours: WINDOW_HOURS } });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage: `${stageBase}:unhandled:${stage}`,
      error: e?.message ?? "Unknown error",
    });
  }
}