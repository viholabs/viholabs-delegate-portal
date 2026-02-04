// src/app/api/control-room/invoices/validate/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

type Payload = {
  invoice_id: string;

  // flags de la factura
  is_paid?: boolean | null;
  source_channel?: "online" | "offline" | "unknown" | null;

  // asignaciones sobre el CLIENTE
  client_id?: string; // opcional (si no lo pasas, lo leemos de invoices)
  delegate_id?: string | null;

  coordinator_commercial_actor_id?: string | null; // assignments (entity_type='client', assignment_kind='commercial')
  coordinator_technical_actor_id?: string | null; // assignments (entity_type='client', assignment_kind='technical')

  // recomendaciones (rémoras)
  recommender_client_ids?: Array<{
    recommender_client_id: string;
    percentage?: number; // default 7
    mode?: "deduct" | "additive"; // default deduct
    active?: boolean; // default true
    notes?: string | null;
  }>;
};

function getServiceClientOrThrow() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function hasAnyPermission(
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean },
  codes: string[]
) {
  if (eff.isSuperAdmin) return true;
  return codes.some((c) => eff.has(c));
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    // ✅ Auth canónica (una sola vez)
    stage = "getActorFromRequest";
    const r = await getActorFromRequest(req);
    if (!r.ok) return json(r.status, { ok: false, stage, error: r.error });

    // ✅ Permisos efectivos (Biblia: no roles hardcoded)
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed = hasAnyPermission(eff, [
      "control_room.invoices.validate",
      "control_room.invoices.manage",
      "invoices.manage",
      "invoices.write",
    ]);

    if (!allowed) {
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (control_room.invoices.validate)",
      });
    }

    // ✅ Escrituras: service role
    stage = "service_client";
    const supabase = getServiceClientOrThrow();

    stage = "body";
    const body = (await req.json().catch(() => null)) as Payload | null;
    if (!body?.invoice_id) return json(400, { ok: false, stage, error: "Missing invoice_id" });

    // 1) Leer invoice para obtener client_id si no viene
    stage = "invoices.select";
    const { data: inv, error: eInv } = await supabase
      .from("invoices")
      .select("id, client_id, needs_review")
      .eq("id", body.invoice_id)
      .single();

    if (eInv) return json(500, { ok: false, stage, error: `invoices.select: ${eInv.message}` });

    const clientId = body.client_id || inv.client_id;
    if (!clientId) return json(400, { ok: false, stage, error: "Invoice has no client_id" });

    // 2) Setear delegate en CLIENTS (solo si estaba NULL, para respetar triggers de inmutabilidad)
    if (body.delegate_id) {
      stage = "clients.select";
      const { data: c0, error: eC0 } = await supabase
        .from("clients")
        .select("id, delegate_id")
        .eq("id", clientId)
        .single();
      if (eC0) return json(500, { ok: false, stage, error: `clients.select: ${eC0.message}` });

      if (!c0.delegate_id) {
        stage = "clients.set_delegate";
        const { error: eCUp } = await supabase
          .from("clients")
          .update({
            delegate_id: body.delegate_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);

        if (eCUp) return json(500, { ok: false, stage, error: `clients.set_delegate: ${eCUp.message}` });
      }
      // Si ya tenía delegate_id, NO lo cambiamos aquí
    }

    // 3) Assignments coordinadores (commercial/technical) sobre entity_type='client'
    async function upsertAssignment(
      kind: "commercial" | "technical",
      coordinatorActorId: string | null | undefined
    ) {
      if (!coordinatorActorId) return;

      const { data: existing, error: eSel } = await supabase
        .from("assignments")
        .select("id, active")
        .eq("entity_type", "client")
        .eq("entity_id", clientId)
        .eq("assignment_kind", kind)
        .maybeSingle();

      if (eSel) throw new Error(`assignments.select(${kind}): ${eSel.message}`);

      if (existing?.id) {
        const { error: eUp } = await supabase
          .from("assignments")
          .update({
            coordinator_actor_id: coordinatorActorId,
            active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (eUp) throw new Error(`assignments.update(${kind}): ${eUp.message}`);
      } else {
        const { error: eIns } = await supabase.from("assignments").insert({
          coordinator_actor_id: coordinatorActorId,
          entity_type: "client",
          entity_id: clientId,
          assignment_kind: kind,
          active: true,
        });

        if (eIns) throw new Error(`assignments.insert(${kind}): ${eIns.message}`);
      }
    }

    stage = "assignments.upsert";
    await upsertAssignment("commercial", body.coordinator_commercial_actor_id ?? null);
    await upsertAssignment("technical", body.coordinator_technical_actor_id ?? null);

    // 4) Recomendaciones (rémoras): client_recommendations
    // Regla: no duplicar. Si existe para (recommender_client_id, referred_client_id) -> update activo/porcentaje/mode.
    if (Array.isArray(body.recommender_client_ids)) {
      stage = "client_recommendations.upsert";
      for (const r0 of body.recommender_client_ids) {
        const recommenderId = r0?.recommender_client_id;
        if (!recommenderId) continue;

        const percentage = typeof r0.percentage === "number" ? r0.percentage : 7;
        const mode = r0.mode === "additive" ? "additive" : "deduct";
        const active = typeof r0.active === "boolean" ? r0.active : true;
        const notes = r0.notes ?? null;

        const { data: ex, error: eSel } = await supabase
          .from("client_recommendations")
          .select("id")
          .eq("recommender_client_id", recommenderId)
          .eq("referred_client_id", clientId)
          .maybeSingle();

        if (eSel) throw new Error(`client_recommendations.select: ${eSel.message}`);

        if (ex?.id) {
          const { error: eUp } = await supabase
            .from("client_recommendations")
            .update({
              percentage,
              mode,
              active,
              notes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", ex.id);

          if (eUp) throw new Error(`client_recommendations.update: ${eUp.message}`);
        } else {
          const { error: eIns } = await supabase.from("client_recommendations").insert({
            recommender_client_id: recommenderId,
            referred_client_id: clientId,
            percentage,
            mode,
            active,
            notes,
          });

          if (eIns) throw new Error(`client_recommendations.insert: ${eIns.message}`);
        }
      }
    }

    // 5) Marcar factura como revisada + flags
    stage = "invoices.update";
    const invoiceUpdate: any = {
      needs_review: false,
      reviewed_at: new Date().toISOString(),
      reviewed_by_actor_id: r.actor.id, // ✅ ahora sí lo dejamos trazable
      updated_at: new Date().toISOString(),
    };

    if (typeof body.is_paid === "boolean") invoiceUpdate.is_paid = body.is_paid;
    if (body.source_channel) invoiceUpdate.source_channel = body.source_channel;

    const { error: eUpInv } = await supabase
      .from("invoices")
      .update(invoiceUpdate)
      .eq("id", body.invoice_id);

    if (eUpInv) return json(500, { ok: false, stage, error: `invoices.update: ${eUpInv.message}` });

    return json(200, {
      ok: true,
      invoice_id: body.invoice_id,
      client_id: clientId,
      updated: {
        delegate_attempted: !!body.delegate_id,
        coordinators: {
          commercial: body.coordinator_commercial_actor_id ?? null,
          technical: body.coordinator_technical_actor_id ?? null,
        },
        recommender_count: Array.isArray(body.recommender_client_ids)
          ? body.recommender_client_ids.length
          : 0,
        invoice_flags: {
          is_paid: typeof body.is_paid === "boolean" ? body.is_paid : "(unchanged)",
          source_channel: body.source_channel ?? "(unchanged)",
          needs_review: false,
        },
      },
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message || String(e) });
  }
}
