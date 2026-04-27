import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";
import { holdedListContacts, HoldedContact, HoldedClientError } from "@/lib/holded/holdedClient";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveDashboardContext(req);
    if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
    if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

    const supa = ctx.supaService;
    const now = new Date().toISOString();

    // Fetch ALL Holded contacts (type 0 = clients, type 1 = suppliers, type 2 = both)
    // We fetch all types and let the raw data speak
    const contacts = await holdedListContacts<HoldedContact[]>();

    if (!contacts.length) {
      return json(200, { ok: true, synced: 0, created: 0, updated: 0, message: "Holded devolvió 0 contactos" });
    }

    let synced = 0;
    let errors: { holded_id: string; error: string }[] = [];

    for (const contact of contacts) {
      if (!contact.id) continue;

      // Extract bill address — Holded stores it under billAddress or defaults
      const billAddr = (contact.billAddress ?? contact.bill_address ?? contact.address_obj ?? {}) as Record<string, unknown>;

      // Primary email: prefer contact email, fall back to billingEmail/invoiceEmail
      const primaryEmail =
        (typeof contact.email === "string" && contact.email.trim()
          ? contact.email.trim().toLowerCase()
          : null) ??
        (typeof contact.billingEmail === "string" && contact.billingEmail.trim()
          ? contact.billingEmail.trim().toLowerCase()
          : null) ??
        (typeof contact.invoiceEmail === "string" && contact.invoiceEmail.trim()
          ? contact.invoiceEmail.trim().toLowerCase()
          : null);

      const billingEmail =
        typeof contact.billingEmail === "string" && contact.billingEmail.trim()
          ? contact.billingEmail.trim().toLowerCase()
          : null;

      const phone =
        (typeof contact.phone === "string" && contact.phone.trim() ? contact.phone.trim() : null) ??
        (typeof contact.mobile === "string" && contact.mobile.trim() ? contact.mobile.trim() : null);

      const vatNumber =
        (typeof contact.vatNumber === "string" && contact.vatNumber.trim() ? contact.vatNumber.trim() : null) ??
        (typeof contact.vatnumber === "string" && contact.vatnumber.trim() ? contact.vatnumber.trim() : null);

      const isCompany = (contact.isperson as number | undefined) === 0;

      const upsertRow = {
        holded_contact_id: contact.id,
        name: contact.name ?? null,
        commercial_name:
          (contact.commercialName as string | null) ??
          (contact.tradeName as string | null) ??
          null,
        legal_name:
          (contact.company as string | null) ??
          (contact.tradeName as string | null) ??
          null,
        contact_email: primaryEmail,
        billing_email: billingEmail,
        contact_phone: phone,
        tax_id: vatNumber,
        vat_number: vatNumber,
        is_company: isCompany,
        fiscal_address_line1: (billAddr.address as string | null) ?? null,
        fiscal_city: (billAddr.city as string | null) ?? null,
        fiscal_postal_code: (billAddr.postalCode as string | null) ?? null,
        fiscal_region: (billAddr.province as string | null) ?? null,
        fiscal_country: (billAddr.countryCode as string | null) ?? null,
        holded_code: (contact.code as string | null) ?? (contact.clientCode as string | null) ?? null,
        holded_type: typeof contact.type === "number" ? contact.type : null,
        holded_raw: contact as unknown as Record<string, unknown>,
        holded_synced_at: now,
        updated_at: now,
      };

      const { error } = await supa
        .from("clients")
        .upsert(upsertRow, { onConflict: "holded_contact_id" });

      if (error) {
        errors.push({ holded_id: contact.id, error: error.message });
      } else {
        synced++;
      }
    }

    // After syncing clients, re-run Shopify email matching for previously unmatched orders
    const { data: unmatched } = await supa
      .from("shopify_orders_raw")
      .select("id, email")
      .is("client_id", null)
      .not("email", "is", null)
      .limit(1000);

    let shopify_matched = 0;
    for (const row of (unmatched ?? []) as { id: string; email: string }[]) {
      if (!row.email) continue;
      const { data: client } = await supa
        .from("clients")
        .select("id")
        .eq("contact_email", row.email.toLowerCase())
        .maybeSingle();
      if (client?.id) {
        await supa.from("shopify_orders_raw").update({ client_id: client.id }).eq("id", row.id);
        shopify_matched++;
      }
    }

    return json(200, {
      ok: true,
      total_holded: contacts.length,
      synced,
      errors: errors.length,
      error_details: errors.slice(0, 10),
      shopify_matched,
    });
  } catch (err: unknown) {
    const msg = err instanceof HoldedClientError ? err.message : String(err);
    return json(500, { ok: false, error: msg });
  }
}
