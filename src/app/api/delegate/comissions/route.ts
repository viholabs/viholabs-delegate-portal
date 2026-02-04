// src/app/api/delegate/comissions/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json, resolveDelegateIdOrThrow } from "../_utils";

export const runtime = "nodejs";

type RpcPermRow = { perm_code: string | null };

function normalizePermCode(v: unknown) {
  return String(v ?? "").trim();
}

async function getPermsOrThrow(supaService: any, actorId: string) {
  const { data, error } = await supaService.rpc("effective_permissions", {
    p_actor_id: actorId,
  });

  if (error) throw new Error(`effective_permissions failed: ${error.message}`);

  const rows = (data ?? []) as RpcPermRow[];
  const codes = rows
    .map((r) => normalizePermCode(r?.perm_code))
    .filter((x) => x.length > 0);

  const isSuperAdmin = codes.includes("*");
  const perms = new Set<string>(codes);

  return {
    isSuperAdmin,
    has: (perm: string) => (isSuperAdmin ? true : perms.has(perm)),
  };
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const url = new URL(req.url);
  const delegateIdQuery = url.searchParams.get("delegateId");
  const period = (url.searchParams.get("period") ?? "").trim(); // "YYYY-MM-01" opcional

  try {
    // 1) Permisos efectivos (canónico)
    const eff = await getPermsOrThrow(r.supaService, r.actor.id);

    // 2) Autorización: leer comisiones
    const allowed =
      eff.isSuperAdmin ||
      eff.has("commissions.read") ||
      eff.has("commissions.manage"); // tolerancia útil si aún no existe read

    if (!allowed) {
      return json(403, { ok: false, error: "No autorizado (commissions.read)" });
    }

    // 3) Resolver delegateId (self o supervisión por permisos)
    const delegateId = await resolveDelegateIdOrThrow({
      supaRls: r.supaRls,
      actor: r.actor,
      delegateIdFromQuery: delegateIdQuery,
      effectivePerms: eff,
    });

    // 4) Lectura con RLS
    let q1 = r.supaRls
      .from("commission_monthly")
      .select(
        "id, beneficiary_type, beneficiary_id, period_month, units_sale, units_promotion, percentage_applied, commission_amount, status, updated_at"
      )
      .eq("beneficiary_type", "delegate")
      .eq("beneficiary_id", delegateId)
      .order("period_month", { ascending: false })
      .limit(50);

    if (period) q1 = q1.eq("period_month", period);

    const { data: delegateRows, error: e1 } = await q1;
    if (e1) return json(500, { ok: false, error: e1.message });

    // 5) Pagos (si existen) — lectura con RLS
    const ids = (delegateRows ?? []).map((x: { id: string }) => x.id);
    let payments: unknown[] = [];

    if (ids.length) {
      const { data: pay, error: e2 } = await r.supaRls
        .from("commission_payments")
        .select("id, commission_monthly_id, paid_at, amount_paid, payment_ref, notes")
        .in("commission_monthly_id", ids)
        .order("paid_at", { ascending: false });

      if (e2) return json(500, { ok: false, error: e2.message });
      payments = pay ?? [];
    }

    return NextResponse.json({
      ok: true,
      delegateId,
      commissions: delegateRows ?? [],
      payments,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Forbidden";
    return json(403, { ok: false, error: msg });
  }
}
