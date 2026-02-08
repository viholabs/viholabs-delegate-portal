// src/app/api/control-room/invoices/review/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  let stage = "init";

  try {
    // 1) Actor actual
    stage = "actor_from_request";
    const ar: any = await getActorFromRequest(req);

    if (!ar?.ok) {
      return json(ar?.status ?? 401, { error: ar?.error ?? "Unauthorized" });
    }

    const actorId: string = ar.actor.id;

    // 2) Permisos
    stage = "permissions";
    const eff = await getEffectivePermissionsByActorId(actorId);

    if (!eff.has("invoices.manage")) {
      return json(403, { error: "Missing permission: invoices.manage" });
    }

    // 3) Payload
    stage = "payload";
    const body = await req.json();
    const { invoice_number, action } = body ?? {};

    if (!invoice_number || !["approve", "reject"].includes(action)) {
      return json(400, {
        error: "Invalid payload",
        expected: { invoice_number: "string", action: "approve|reject" },
      });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // 4) Update staging (trigger exigeix reviewer_actor_id)
    stage = "update_staging";
    const supabase = await createClient();

    const { error } = await supabase
      .from("import_invoice_staging")
      .update({
        review_status: newStatus,
        reviewer_actor_id: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_number", invoice_number);

    if (error) {
      return json(500, {
        error: "Review update failed",
        stage,
        detail: error.message,
      });
    }

    return json(200, {
      ok: true,
      invoice_number,
      review_status: newStatus,
      reviewer_actor_id: actorId,
    });
  } catch (err: any) {
    return json(500, {
      error: "Unexpected error",
      stage,
      detail: err?.message ?? String(err),
    });
  }
}
