import { NextRequest, NextResponse } from "next/server";

import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await getActorFromRequest(req);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const actor = auth.actor;
  const supa = auth.supaRls;

  const eff = await getEffectivePermissionsByActorId(actor.id);

  if (!eff.isSuperAdmin) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 }
    );
  }

  try {
    /* ------------------------------- */
    /* contacts mirror */
    /* ------------------------------- */

    const { count: contacts } = await supa
      .from("holded_contacts")
      .select("holded_contact_id", { count: "exact", head: true });

    /* ------------------------------- */
    /* mappings */
    /* ------------------------------- */

    const { count: mappings } = await supa
      .from("holded_contact_client_map_g1")
      .select("holded_contact_id", { count: "exact", head: true });

    /* ------------------------------- */
    /* invoices without mapping */
    /* ------------------------------- */

    const { count: invoicesWithoutMapping } = await supa
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("source_provider", "holded")
      .is("holded_contact_id", null);

    /* ------------------------------- */
    /* duplicated invoices */
    /* ------------------------------- */

    const { data: duplicates } = await supa.rpc(
      "count_duplicate_holded_invoices"
    );

    const duplicatedInvoices = duplicates ?? 0;

    /* ------------------------------- */
    /* holded import status */
    /* ------------------------------- */

    const { data: syncState } = await supa
      .from("holded_sync_state")
      .select("last_sync_at, last_cursor, updated_at")
      .limit(1)
      .single();

    /* ------------------------------- */
    /* status */
    /* ------------------------------- */

    let status: "green" | "yellow" | "red" = "green";

    if (duplicatedInvoices > 0 || (invoicesWithoutMapping ?? 0) > 0) {
      status = "red";
    } else if ((contacts ?? 0) - (mappings ?? 0) > 0) {
      status = "yellow";
    }

    return NextResponse.json({
      ok: true,
      health: {
        holded_contacts: contacts ?? 0,
        mappings: mappings ?? 0,
        contacts_without_mapping: (contacts ?? 0) - (mappings ?? 0),
        clients_without_mapping: 0,
        invoices_without_mapping: invoicesWithoutMapping ?? 0,
        duplicated_invoices: duplicatedInvoices,
        status,
        importer: {
          last_sync_at: syncState?.last_sync_at ?? null,
          last_cursor: syncState?.last_cursor ?? null,
          updated_at: syncState?.updated_at ?? null,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || "unexpected error",
    });
  }
}