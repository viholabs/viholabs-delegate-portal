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
  iban?: string | null;
  bank_account_holder?: string | null;
  payment_method_name?: string | null;
  payment_terms_name?: string | null;
  equivalence_surcharge?: boolean | null;
  notes?: string | null;
  vat_percent?: number | null;
};

type ClientListRow = {
  id: string | null;
  created_at: string | null;
  actor_id: string | null;
  delegate_id: string | null;
  profile_type: string | null;
  tax_id: string | null;
  name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string | null;
  updated_at: string | null;
  recommended_by_client_id: string | null;
  name_raw: string | null;
  legal_name: string | null;
  billing_email: string | null;
  fiscal_address_line1: string | null;
  fiscal_address_line2: string | null;
  fiscal_city: string | null;
  fiscal_region: string | null;
  fiscal_postal_code: string | null;
  fiscal_country: string | null;
  vat_number: string | null;
  is_company: boolean | null;
  state_code: string | null;
  holded_contact_id: string | null;
  payment_method_name: string | null;
  payment_terms_name: string | null;
  iban: string | null;
  bank_account_holder: string | null;
  sepa_status: string | null;
  sepa_reference: string | null;
  sepa_generated_at: string | null;
  sepa_signed_at: string | null;
  sepa_document_path: string | null;
};

type InsertedClientRow = {
  id: string;
  name: string | null;
  tax_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  delegate_id: string | null;
  holded_contact_id: string | null;
  status: string | null;
  profile_type: string | null;
  created_at: string | null;
  payment_method_name: string | null;
  payment_terms_name: string | null;
  iban: string | null;
  bank_account_holder: string | null;
  sepa_status: string | null;
};

type AssignmentRow = {
  client_holded_contact_id: string | null;
  actor_id: string | null;
  valid_from: string | null;
  source: string | null;
};

type ActorRow = {
  id: string | null;
  name: string | null;
  email: string | null;
};

type ClientItemResponse = {
  id: string | null;
  created_at: string | null;
  actor_id: string | null;
  delegate_id: string | null;
  profile_type: string | null;
  tax_id: string | null;
  name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string | null;
  updated_at: string | null;
  recommended_by_client_id: string | null;
  name_raw: string | null;
  legal_name: string | null;
  billing_email: string | null;
  fiscal_address_line1: string | null;
  fiscal_address_line2: string | null;
  fiscal_city: string | null;
  fiscal_region: string | null;
  fiscal_postal_code: string | null;
  fiscal_country: string | null;
  vat_number: string | null;
  is_company: boolean | null;
  state_code: string | null;
  holded_contact_id: string | null;
  payment_method_name: string | null;
  payment_terms_name: string | null;
  iban: string | null;
  bank_account_holder: string | null;
  sepa_status: string | null;
  sepa_reference: string | null;
  sepa_generated_at: string | null;
  sepa_signed_at: string | null;
  sepa_document_path: string | null;
  delegate_name: string | null;
  delegate_email: string | null;
  delegate_valid_from: string | null;
  delegate_source: string | null;
};

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function normalizeTaxId(raw: string) {
  return safeStr(raw).replace(/\s+/g, "").toUpperCase().trim();
}

function normalizeIban(raw: string) {
  return safeStr(raw).replace(/\s+/g, "").toUpperCase();
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

  const response = await fetch(
    "https://api.holded.com/api/invoicing/v1/contacts",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        key: apiKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const text = await response.text();
  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new HoldedClientError(
      `Holded HTTP ${response.status}`,
      response.status,
      body
    );
  }

  const holdedBody = body as { id?: unknown; _id?: unknown } | null;
  const holdedContactId = safeStr(holdedBody?.id || holdedBody?._id);

  if (!holdedContactId) {
    throw new HoldedClientError(
      "Holded contact created but id missing",
      response.status,
      body
    );
  }

  return {
    holdedContactId,
    holdedBody: body,
    sentPayload: payload,
  };
}

const CLIENT_SELECT_FIELDS = [
  "id",
  "created_at",
  "actor_id",
  "delegate_id",
  "profile_type",
  "tax_id",
  "name",
  "contact_email",
  "contact_phone",
  "status",
  "updated_at",
  "recommended_by_client_id",
  "name_raw",
  "legal_name",
  "billing_email",
  "fiscal_address_line1",
  "fiscal_address_line2",
  "fiscal_city",
  "fiscal_region",
  "fiscal_postal_code",
  "fiscal_country",
  "vat_number",
  "is_company",
  "state_code",
  "holded_contact_id",
  "payment_method_name",
  "payment_terms_name",
  "iban",
  "bank_account_holder",
  "sepa_status",
  "sepa_reference",
  "sepa_generated_at",
  "sepa_signed_at",
  "sepa_document_path",
].join(",");

function buildClientResponseItem(args: {
  client: ClientListRow;
  delegateActorId: string | null;
  delegateName: string | null;
  delegateEmail: string | null;
  delegateValidFrom: string | null;
  delegateSource: string | null;
}): ClientItemResponse {
  const { client, delegateActorId, delegateName, delegateEmail, delegateValidFrom, delegateSource } = args;

  return {
    id: client.id ?? null,
    created_at: client.created_at ?? null,
    actor_id: client.actor_id ?? null,
    delegate_id: delegateActorId ?? null,
    profile_type: client.profile_type ?? null,
    tax_id: client.tax_id ?? null,
    name: client.name ?? null,
    contact_email: client.contact_email ?? null,
    contact_phone: client.contact_phone ?? null,
    status: client.status ?? null,
    updated_at: client.updated_at ?? null,
    recommended_by_client_id: client.recommended_by_client_id ?? null,
    name_raw: client.name_raw ?? null,
    legal_name: client.legal_name ?? null,
    billing_email: client.billing_email ?? null,
    fiscal_address_line1: client.fiscal_address_line1 ?? null,
    fiscal_address_line2: client.fiscal_address_line2 ?? null,
    fiscal_city: client.fiscal_city ?? null,
    fiscal_region: client.fiscal_region ?? null,
    fiscal_postal_code: client.fiscal_postal_code ?? null,
    fiscal_country: client.fiscal_country ?? null,
    vat_number: client.vat_number ?? null,
    is_company: client.is_company ?? null,
    state_code: client.state_code ?? null,
    holded_contact_id: client.holded_contact_id ?? null,
    payment_method_name: client.payment_method_name ?? null,
    payment_terms_name: client.payment_terms_name ?? null,
    iban: client.iban ?? null,
    bank_account_holder: client.bank_account_holder ?? null,
    sepa_status: client.sepa_status ?? null,
    sepa_reference: client.sepa_reference ?? null,
    sepa_generated_at: client.sepa_generated_at ?? null,
    sepa_signed_at: client.sepa_signed_at ?? null,
    sepa_document_path: client.sepa_document_path ?? null,
    delegate_name: delegateName ?? null,
    delegate_email: delegateEmail ?? null,
    delegate_valid_from: delegateValidFrom ?? null,
    delegate_source: delegateSource ?? null,
  };
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  let stage = "init";

  try {
    const url = new URL(req.url);
    const delegateIdQuery = safeStr(url.searchParams.get("delegateId"));
    const q = safeStr(url.searchParams.get("q"));

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
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (clients.read)",
      });
    }

    const isSupervisor = actorLooksSupervisor({
      actorRole: r.actor.role ?? null,
      eff,
    });

    let delegateActorId: string | null = null;

    if (delegateIdQuery) {
      if (
        !(
          eff.isSuperAdmin ||
          eff.has("control_room.delegates.read") ||
          eff.has("actors.read")
        )
      ) {
        return json(403, {
          ok: false,
          stage: "resolve_delegate",
          error: "No autorizado para supervisión (actors.read)",
        });
      }

      delegateActorId = delegateIdQuery;
    } else if (isSupervisor) {
      delegateActorId = null;
    } else {
      delegateActorId = String(r.actor.id);
    }

    // -----------------------------------------------------------------------
    // SUPERVISOR without a specific delegate filter
    // → Query ALL clients directly so clients without assignment rows
    //   (e.g. auto-created by the invoice importer) are always visible.
    //   Assignments are loaded only for enrichment (delegate name/email).
    // -----------------------------------------------------------------------
    if (isSupervisor && !delegateActorId) {
      stage = "query_clients_all";
      const clientsResponse = await r.supaService
        .from("clients")
        .select(CLIENT_SELECT_FIELDS)
        .order("name", { ascending: true });

      if (clientsResponse.error) {
        return json(500, { ok: false, stage, error: clientsResponse.error.message });
      }

      const clientRows = ((clientsResponse.data ?? []) as unknown[]) as ClientListRow[];

      stage = "query_assignments_all";
      const assignmentsResponse = await r.supaService
        .from("client_actor_assignments_g1")
        .select("client_holded_contact_id,actor_id,valid_from,source")
        .eq("assignment_role", "delegate")
        .is("valid_to", null);

      const allAssignmentRows = ((assignmentsResponse.data ?? []) as unknown[]) as AssignmentRow[];
      const assignmentByHci = new Map<string, { actor_id: string; valid_from: string | null; source: string | null }>();
      const allActorIds = new Set<string>();

      for (const row of allAssignmentRows) {
        const hci = safeStr(row.client_holded_contact_id);
        const aid = safeStr(row.actor_id);
        if (hci && aid && !assignmentByHci.has(hci)) {
          assignmentByHci.set(hci, { actor_id: aid, valid_from: row.valid_from ?? null, source: row.source ?? null });
          allActorIds.add(aid);
        }
      }

      // Also collect delegate_id from clients themselves as fallback
      for (const client of clientRows) {
        const did = safeStr(client.delegate_id);
        if (did) allActorIds.add(did);
      }

      stage = "query_actors_all";
      const actorsById = new Map<string, ActorRow>();
      if (allActorIds.size > 0) {
        const actorsResponse = await r.supaService
          .from("actors")
          .select("id,name,email")
          .in("id", Array.from(allActorIds));

        if (!actorsResponse.error) {
          for (const actor of ((actorsResponse.data ?? []) as unknown[]) as ActorRow[]) {
            const id = safeStr(actor.id);
            if (id) actorsById.set(id, actor);
          }
        }
      }

      const mergedRows: ClientItemResponse[] = clientRows.map((client) => {
        const hci = safeStr(client.holded_contact_id);
        const assignment = hci ? assignmentByHci.get(hci) : undefined;
        // Fallback to clients.delegate_id when no assignment row exists
        const resolvedDelegateId = assignment?.actor_id ?? safeStr(client.delegate_id) ?? null;
        const delegateActor = resolvedDelegateId ? actorsById.get(resolvedDelegateId) : undefined;

        return buildClientResponseItem({
          client,
          delegateActorId: resolvedDelegateId,
          delegateName: delegateActor?.name ?? null,
          delegateEmail: delegateActor?.email ?? null,
          delegateValidFrom: assignment?.valid_from ?? null,
          delegateSource: assignment?.source ?? null,
        });
      });

      const filteredRows = q
        ? mergedRows.filter((c) => {
            const nq = normalize(q);
            return (
              normalize(String(c.name ?? "")).includes(nq) ||
              normalize(String(c.legal_name ?? "")).includes(nq) ||
              normalize(String(c.tax_id ?? "")).includes(nq) ||
              normalize(String(c.contact_email ?? "")).includes(nq)
            );
          })
        : mergedRows;

      filteredRows.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name), "es"));

      return NextResponse.json({ ok: true, delegateActorId, items: filteredRows });
    }

    // -----------------------------------------------------------------------
    // DELEGATE mode (or supervisor filtering by specific delegate)
    // → Assignment rows are required — only show clients with an active assignment.
    // -----------------------------------------------------------------------
    stage = "query_assignments";
    let assignmentsQuery = r.supaService
      .from("client_actor_assignments_g1")
      .select("client_holded_contact_id,actor_id,valid_from,source")
      .eq("assignment_role", "delegate")
      .is("valid_to", null);

    if (delegateActorId) {
      assignmentsQuery = assignmentsQuery.eq("actor_id", delegateActorId);
    }

    const assignmentsResponse = await assignmentsQuery;
    if (assignmentsResponse.error) {
      return json(500, {
        ok: false,
        stage,
        error: assignmentsResponse.error.message,
      });
    }

    const assignmentRows = ((assignmentsResponse.data ?? []) as unknown[]) as AssignmentRow[];

    const canonicalAssignments = assignmentRows.filter(
      (row) => !!safeStr(row.client_holded_contact_id) && !!safeStr(row.actor_id)
    );

    if (!canonicalAssignments.length) {
      return NextResponse.json({
        ok: true,
        delegateActorId,
        items: [],
      });
    }

    const holdedContactIds = Array.from(
      new Set(
        canonicalAssignments
          .map((row) => safeStr(row.client_holded_contact_id))
          .filter(Boolean)
      )
    );

    const actorIds = Array.from(
      new Set(
        canonicalAssignments
          .map((row) => safeStr(row.actor_id))
          .filter(Boolean)
      )
    );

    stage = "query_clients";
    const clientsResponse = await r.supaService
      .from("clients")
      .select(CLIENT_SELECT_FIELDS)
      .in("holded_contact_id", holdedContactIds)
      .order("name", { ascending: true });

    if (clientsResponse.error) {
      return json(500, {
        ok: false,
        stage,
        error: clientsResponse.error.message,
      });
    }

    const clientRows = ((clientsResponse.data ?? []) as unknown[]) as ClientListRow[];

    stage = "query_actors";
    const actorsById = new Map<string, ActorRow>();
    if (actorIds.length > 0) {
      const actorsResponse = await r.supaService
        .from("actors")
        .select("id,name,email")
        .in("id", actorIds);

      if (actorsResponse.error) {
        return json(500, {
          ok: false,
          stage,
          error: actorsResponse.error.message,
        });
      }

      const actors = ((actorsResponse.data ?? []) as unknown[]) as ActorRow[];
      for (const actor of actors) {
        const id = safeStr(actor.id);
        if (id) actorsById.set(id, actor);
      }
    }

    const assignmentByHoldedContactId = new Map<
      string,
      {
        actor_id: string;
        valid_from: string | null;
        source: string | null;
      }
    >();

    for (const row of canonicalAssignments) {
      const holdedContactId = safeStr(row.client_holded_contact_id);
      const actorId = safeStr(row.actor_id);
      if (!holdedContactId || !actorId) continue;

      if (!assignmentByHoldedContactId.has(holdedContactId)) {
        assignmentByHoldedContactId.set(holdedContactId, {
          actor_id: actorId,
          valid_from: row.valid_from ?? null,
          source: row.source ?? null,
        });
      }
    }

    const mergedRows: ClientItemResponse[] = clientRows
      .map((client) => {
        const holdedContactId = safeStr(client.holded_contact_id);
        if (!holdedContactId) return null;

        const assignment = assignmentByHoldedContactId.get(holdedContactId);
        if (!assignment) return null;

        const delegateActor = actorsById.get(assignment.actor_id);

        return buildClientResponseItem({
          client,
          delegateActorId: assignment.actor_id,
          delegateName: delegateActor?.name ?? null,
          delegateEmail: delegateActor?.email ?? null,
          delegateValidFrom: assignment.valid_from ?? null,
          delegateSource: assignment.source ?? null,
        });
      })
      .filter((row): row is ClientItemResponse => !!row);

    const filteredRows = q
      ? mergedRows.filter((c) => {
          const nq = normalize(q);
          const byName = normalize(String(c.name ?? ""));
          const byLegalName = normalize(String(c.legal_name ?? ""));
          const byTaxId = normalize(String(c.tax_id ?? ""));
          const byEmail = normalize(String(c.contact_email ?? ""));

          return (
            byName.includes(nq) ||
            byLegalName.includes(nq) ||
            byTaxId.includes(nq) ||
            byEmail.includes(nq)
          );
        })
      : mergedRows;

    filteredRows.sort((a, b) =>
      safeStr(a.name).localeCompare(safeStr(b.name), "es")
    );

    return NextResponse.json({
      ok: true,
      delegateActorId,
      items: filteredRows,
    });
  } catch (e: unknown) {
    return json(500, {
      ok: false,
      stage,
      error: e instanceof Error ? e.message : "Error inesperado",
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
      return json(403, {
        ok: false,
        stage,
        error: "No autorizado (clients.manage)",
      });
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
      if (
        !(
          eff.isSuperAdmin ||
          eff.has("control_room.delegates.read") ||
          eff.has("actors.read")
        )
      ) {
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
    const iban = normalizeIban(body.iban ?? "");
    const bankAccountHolder = safeStr(body.bank_account_holder);
    const paymentMethodName = safeStr(body.payment_method_name);
    const paymentTermsName = safeStr(body.payment_terms_name);
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
    if (!contactPhone) {
      return json(400, { ok: false, stage, error: "phone requerido" });
    }
    if (!contactEmail) {
      return json(400, { ok: false, stage, error: "email requerido" });
    }
    if (!isValidEmail(contactEmail)) {
      return json(400, { ok: false, stage, error: "email inválido" });
    }
    if (!fiscalAddressLine1) {
      return json(400, {
        ok: false,
        stage,
        error: "shipping_address requerido",
      });
    }
    if (!fiscalPostalCode) {
      return json(400, {
        ok: false,
        stage,
        error: "shipping_postal_code requerido",
      });
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
    const insertResponse = await r.supaService
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
        payment_method_name: paymentMethodName || null,
        payment_terms_name: paymentTermsName || null,
        iban: iban || null,
        bank_account_holder: bankAccountHolder || null,
        sepa_status: iban ? "PENDING_SIGNATURE" : null,
      })
      .select(
        [
          "id",
          "name",
          "tax_id",
          "contact_email",
          "contact_phone",
          "delegate_id",
          "holded_contact_id",
          "status",
          "profile_type",
          "created_at",
          "payment_method_name",
          "payment_terms_name",
          "iban",
          "bank_account_holder",
          "sepa_status",
        ].join(",")
      )
      .single();

    const insertedClientError = insertResponse.error;
    if (insertedClientError) {
      return json(500, {
        ok: false,
        stage,
        error: insertedClientError.message,
        holded_contact_id: holded.holdedContactId,
      });
    }

    const insertedClient = (insertResponse.data as unknown) as InsertedClientRow | null;

    if (!insertedClient?.id) {
      return json(500, {
        ok: false,
        stage,
        error: "Client insert returned no id",
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
      client: insertedClient,
      meta: {
        delegate_actor_id: delegateActorId,
        holded_contact_id: holded.holdedContactId,
      },
    });
  } catch (e: unknown) {
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
      error: e instanceof Error ? e.message : "Error inesperado",
    });
  }
}