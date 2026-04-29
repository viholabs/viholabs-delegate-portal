// POST /api/holded/sync
// Triggers a full sync of all Holded invoices into holded_invoices + holded_invoice_lines.
// Restricted to MELQUISEDEC and SUPER_ADMIN roles.
// Invoked by the SyncButton in the portal shell.

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { normalizeRole } from "@/lib/auth/roles";
import { syncAllHoldedInvoices } from "@/lib/holded/invoiceSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = (await getActorFromRequest(req)) as {
    ok?: boolean;
    actor?: unknown;
    status?: number;
    error?: string;
  };

  if (!auth?.ok) {
    return NextResponse.json(
      { ok: false, error: auth?.error ?? "Unauthorized" },
      { status: auth?.status ?? 401 }
    );
  }

  const actor = auth.actor as Record<string, unknown> | null;
  const role = normalizeRole(String(actor?.role ?? ""));

  if (role !== "MELQUISEDEC" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncAllHoldedInvoices();
    return NextResponse.json({
      ok: true,
      message: `Sync completado: ${result.synced}/${result.totalFound} facturas (${result.errors} errores) en ${Math.round(result.durationMs / 1000)}s`,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
