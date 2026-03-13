// src/app/api/delegate/clients/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json } from "../_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";
import { HoldedClientError } from "@/lib/holded/holdedClient";

export const runtime = "nodejs";

function normalize(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function actorLooksSupervisor(args: {
  actorRole: string | null;
  eff: { isSuperAdmin: boolean; has: (code: string) => boolean };
}) {
  const { actorRole, eff } = args;
  const role = String(actorRole ?? "").toUpperCase();

  return (
    eff.isSuperAdmin ||
    eff.has("control_room.delegates.read") ||
    eff.has("actors.read") ||
    role === "MELQUISEDEC" ||
    role === "SUPER_ADMIN" ||
    role === "ADMINISTRATIVE" ||
    role === "COORDINATOR_COMMERCIAL" ||
    role === "COORDINATOR_CECT" ||
    role === "KOL"
  );
}

type CreateClientBody = {
  delegate_id?: string | null;
  name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  shipping_address?: string | null;
  shipping_postal_code?: string | null;
  shipping_city?: string | null;
  shipping_province?: string | null;
  shipping_country?: string | null;
  equivalence_surcharge?: boolean | null;
  notes?: string | null;
  vat_percent?: number | null;
};

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function normalizeTaxId(raw: string) {
  return safeStr(raw).replace(/\s+/g, "").toUpperCase().trim();
}

function isValidSpanishTaxId(raw: string) {
  const value = normalizeTaxId(raw);
  if (!value) return false;

  const dni = /^(\d{8})([A-Z])$/;
  const nie = /^[XYZ]\d{7}[A-Z]$/;
  const cif = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/;

  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";

  const dniMatch = value.match(dni);
  if (dniMatch) {
    const num = Number(dniMatch[1]);
    const letter = dniMatch[2];
    return letters[num % 23] === letter;
  }

  if (nie.test(value)) {
    const first = value[0] === "X" ? "0" : value[0] === "Y" ? "1" : "2";
    const num = Number(`${first}${value.slice(1, 8)}`);
    const letter = value[8];
    return letters[num % 23] === letter;
  }

  if (cif.test(value)) {
    const control = value[value.length - 1];
    const digits = value
      .slice(1, 8)
      .split("")
      .map((n) => Number(n));

    const sumEven = digits
      .filter((_, idx) => idx % 2 === 1)
      .reduce((acc, n) => acc + n, 0);

    const sumOdd = digits
      .filter((_, idx) => idx % 2 === 0)
      .reduce((acc, n) => {
        const doubled = n * 2;
        return acc + Math.floor(doubled / 10) + (doubled % 10);
      }, 0);

    const total = sumEven + sumOdd;
    const unit = (10 - (total % 10)) % 10;
    const controlLetter = "JABCDEFGHI"[unit];
    const firstLetter = value[0];

    const mustBeLetter = /[KPQS]/.test(firstLetter);
    const mustBeDigit = /[ABEH]/.test(firstLetter);

    if (mustBeLetter) return control === controlLetter;
    if (mustBeDigit) return control === String(unit);
    return control === String(unit) || control === controlLetter;
  }

  return false;
}

async function createHoldedContact(args: {
  name: string;
  taxId: string;
  email: string;
  phone: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  equivalenceSurcharge: boolean;
  vatPercent: number | null;
  notes: string;
}) {
  const apiKey = (process.env.HOLDED_API_KEY || "").trim();
  if (!apiKey) {
    throw new HoldedClientError("HOLDED_API_KEY missing (server env)", null);
  }

  const payload = {
    name: args.name,
    code: args.taxId,
    email: args.email || undefined,
    phone: args.phone || undefined,
    billAddress: {
      address: args.addressLine1 || "",
      postalCode: args.postalCode || "",
      city: args.city || "",
      province: args.region || "",
      country: args.country || "España",
    },
    shippingAddresses: [
      {
        address: args.addressLine1 || "",
        postalCode: args.postalCode || "",
        city: args.city || "",
        province: args.region || "",
        country: args.country || "España",
      },
    ],
    customFields: [
      {
        name: "portal_equivalence_surcharge",
        value: args.equivalenceSurcharge ? "yes" : "no",
      },
      {
        name: "portal_vat_percent",
        value: args.vatPercent == null ? "" : String(args.vatPercent),
      },
      {
        name: "portal_notes",
        value: args.notes || "",
      },
    ],
  };

  const response = await fetch("https://api.holded.com/api/invoicing/v1/contacts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      key: apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await response.text();
  let body: any = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new HoldedClientError(`Holded HTTP ${response.status}`, response.status, body);
  }

  const holdedContactId = safeStr(body?.id || body?._id);
  if (!holdedContactId) {
    throw new HoldedClientError("Holded contact created but id missing", response.status, body);
  }

  return {
    holdedContactId,
    holdedBody: body,
    sentPayload: payload,
  };
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  let stage = "init";

  try {
    const url = new URL(req.url);
    const delegateIdQuery = (url.searchParams.get("delegateId") ?? "").trim();
    const q = (url.searchParams.get("q") ?? "").trim();

    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("clients.read") ||
      eff.has("clients.manage") ||
      eff.has("control_room.delegates.read") ||
      eff.has("actors.read");

    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (clients.read)" });
    }

    const isSupervisor = actorLooksSupervisor({
      actorRole: r.actor.role ?? null,
      eff,
    });

    let delegateActorId: string | null = null;

    if (delegateIdQuery) {
      if (!(eff.isSuperAdmin || eff.has("control_room.delegates.read") || eff.has("actors.read"))) {
        return json(403, {
          ok: false,
          stage: "resolve_delegate",
          error: "No autorizado para supervisión (actors.read)",
        });
      }

      delegateActorId = delegateIdQuery;
    } else if (isSupervisor) {
      return NextResponse.json({
        ok: true,
        delegateActorId: null,
        items: [],
      });
    } else {
      delegateActorId = String(r.actor.id);
    }

    stage = "query";
    const { data, error } = await r.supaService
      .from("v_control_room_clients_by_delegate_current")
      .select(
        "client_id, client_name, holded_contact_id, delegate_actor_id, delegate_name, delegate_email, delegate_valid_from, delegate_source"
      )
      .eq("delegate_actor_id", delegateActorId)
      .order("client_name", { ascending: true });

    if (error) {
      return json(500, { ok: false, stage, error: error.message });
    }

    let rows = Array.isArray(data) ? data : [];

    if (q) {
      const nq = normalize(q);
      rows = rows.filter((c: any) => {
        const n = normalize(String(c?.client_name ?? ""));
        return n.includes(nq);
      });
    }

    return NextResponse.json({
      ok: true,
      delegateActorId,
      items: rows.map((c: any) => ({
        id: String(c?.client_id ?? ""),
        name: c?.client_name ?? null,
        tax_id: null,
        contact_email: null,
        contact_phone: null,
        status: null,
        profile_type: null,
        created_at: null,
        delegate_id: c?.delegate_actor_id ?? null,
        holded_contact_id: c?.holded_contact_id ?? null,
        delegate_name: c?.delegate_name ?? null,
        delegate_email: c?.delegate_email ?? null,
        delegate_valid_from: c?.delegate_valid_from ?? null,
        delegate_source: c?.delegate_source ?? null,
      })),
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}

export async function POST(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  let stage = "init";

  try {
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed =
      eff.isSuperAdmin ||
      eff.has("clients.manage") ||
      eff.has("clients.read") ||
      eff.has("control_room.delegates.read") ||
      eff.has("actors.read");

    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (clients.manage)" });
    }

    stage = "parse_body";
    const body = (await req.json().catch(() => null)) as CreateClientBody | null;
    if (!body) {
      return json(400, { ok: false, stage, error: "Body JSON inválido" });
    }

    const requestedDelegateId = safeStr(body.delegate_id);
    const isSupervisor = actorLooksSupervisor({
      actorRole: r.actor.role ?? null,
      eff,
    });

    let delegateActorId = "";

    stage = "resolve_delegate";
    if (requestedDelegateId) {
      if (!(eff.isSuperAdmin || eff.has("control_room.delegates.read") || eff.has("actors.read"))) {
        return json(403, {
          ok: false,
          stage,
          error: "No autorizado para crear clientes para otro delegado",
        });
      }

      delegateActorId = requestedDelegateId;
    } else if (isSupervisor) {
      return json(400, {
        ok: false,
        stage,
        error: "delegate_id requerido para supervisor",
      });
    } else {
      delegateActorId = String(r.actor.id);
    }

    const name = safeStr(body.name);
    const taxId = normalizeTaxId(body.tax_id ?? "");
    const contactEmail = safeStr(body.email);
    const contactPhone = safeStr(body.phone);
    const fiscalAddressLine1 = safeStr(body.shipping_address);
    const fiscalPostalCode = safeStr(body.shipping_postal_code);
    const fiscalCity = safeStr(body.shipping_city);
    const fiscalRegion = safeStr(body.shipping_province);
    const fiscalCountry = safeStr(body.shipping_country) || "España";
    const notes = safeStr(body.notes);
    const equivalenceSurcharge = !!body.equivalence_surcharge;
    const vatPercent =
      typeof body.vat_percent === "number" && Number.isFinite(body.vat_percent)
        ? body.vat_percent
        : null;

    stage = "validate";
    if (!name) return json(400, { ok: false, stage, error: "name requerido" });
    if (!taxId) return json(400, { ok: false, stage, error: "tax_id requerido" });
    if (!isValidSpanishTaxId(taxId)) {
      return json(400, { ok: false, stage, error: "tax_id inválido" });
    }
    if (!contactPhone) return json(400, { ok: false, stage, error: "phone requerido" });
    if (!contactEmail) return json(400, { ok: false, stage, error: "email requerido" });
    if (!isValidEmail(contactEmail)) {
      return json(400, { ok: false, stage, error: "email inválido" });
    }
    if (!fiscalAddressLine1) {
      return json(400, { ok: false, stage, error: "shipping_address requerido" });
    }
    if (!fiscalPostalCode) {
      return json(400, { ok: false, stage, error: "shipping_postal_code requerido" });
    }

    stage = "create_holded_contact";
    const holded = await createHoldedContact({
      name,
      taxId,
      email: contactEmail,
      phone: contactPhone,
      addressLine1: fiscalAddressLine1,
      postalCode: fiscalPostalCode,
      city: fiscalCity,
      region: fiscalRegion,
      country: fiscalCountry,
      equivalenceSurcharge,
      vatPercent,
      notes,
    });

    stage = "insert_client";
    const { data: insertedClient, error: insertClientError } = await r.supaService
      .from("clients")
      .insert({
        name,
        name_raw: name,
        legal_name: name,
        tax_id: taxId,
        contact_email: contactEmail,
        billing_email: contactEmail,
        contact_phone: contactPhone,
        fiscal_address_line1: fiscalAddressLine1,
        fiscal_city: fiscalCity || null,
        fiscal_region: fiscalRegion || null,
        fiscal_postal_code: fiscalPostalCode,
        fiscal_country: fiscalCountry,
        delegate_id: delegateActorId,
        holded_contact_id: holded.holdedContactId,
        status: "PENDING_VALIDATION",
        state_code: "OPEN",
        profile_type: "CLIENT",
      })
      .select(
        "id, name, tax_id, contact_email, contact_phone, delegate_id, holded_contact_id, status, profile_type, created_at"
      )
      .single();

    if (insertClientError) {
      return json(500, {
        ok: false,
        stage,
        error: insertClientError.message,
        holded_contact_id: holded.holdedContactId,
      });
    }

    stage = "insert_validation_queue";
    const { error: validationError } = await r.supaService
      .from("client_delegate_validation_queue")
      .insert({
        client_id: insertedClient.id,
        proposed_delegate_id: delegateActorId,
        status: "PENDING",
        notes: "Created from Orders console; requires validation",
      });

    if (validationError) {
      return json(500, {
        ok: false,
        stage,
        error: validationError.message,
        client_id: insertedClient.id,
        holded_contact_id: holded.holdedContactId,
      });
    }

    stage = "insert_delegate_assignment";
    const { error: assignmentError } = await r.supaService
      .from("client_actor_assignments_g1")
      .insert({
        client_holded_contact_id: holded.holdedContactId,
        actor_id: delegateActorId,
        assignment_role: "delegate",
        valid_from: new Date().toISOString().slice(0, 10),
        valid_to: null,
        source: "orders_console_manual_create",
      });

    if (assignmentError) {
      return json(500, {
        ok: false,
        stage,
        error: assignmentError.message,
        client_id: insertedClient.id,
        holded_contact_id: holded.holdedContactId,
      });
    }

    return NextResponse.json({
      ok: true,
      client: {
        id: insertedClient.id,
        name: insertedClient.name,
        tax_id: insertedClient.tax_id,
        contact_email: insertedClient.contact_email,
        contact_phone: insertedClient.contact_phone,
        delegate_id: insertedClient.delegate_id,
        holded_contact_id: insertedClient.holded_contact_id,
        status: insertedClient.status,
        profile_type: insertedClient.profile_type,
        created_at: insertedClient.created_at,
      },
      meta: {
        delegate_actor_id: delegateActorId,
        holded_contact_id: holded.holdedContactId,
      },
    });
  } catch (e: any) {
    if (e instanceof HoldedClientError) {
      return json(e.status ?? 502, {
        ok: false,
        stage,
        error: e.message,
        holded_error_body: e.body ?? null,
      });
    }

    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado",
    });
  }
}