import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

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
  supaRls: any;
  supaService?: any;
};

type ActorFromRequestFail = {
  ok: false;
  status: number;
  error: string;
};

type ActorRoleRow = {
  actor_id: string;
  role_code: string | null;
  state_code: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  holded_contact_id: string | null;
};

type AffiliateAccountRow = {
  id: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
  state_code: string | null;
};

type Payload = {
  clientId: string;
  affiliateAccountId: string | null;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function isOk(ar: unknown): ar is ActorFromRequestOk {
  if (!ar || typeof ar !== "object") return false;

  const v = ar as {
    ok?: unknown;
    actor?: { id?: unknown } | null;
    supaService?: unknown;
  };

  return v.ok === true && typeof v.actor?.id === "string" && !!v.supaService;
}

function normalizeRole(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function md5(value: string) {
  return crypto.createHash("md5").update(value, "utf8").digest("hex");
}

function getServiceClientOrThrow() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function canManageClientAssignmentsByRole(roles: string[]): boolean {
  return roles.some((role) =>
    [
      "melquisedec",
      "super_admin",
      "delegate",
      "kol",
      "coordinator",
      "coordinator_commercial",
      "coordinator_cect",
      "administrative",
      "administrativa",
    ].includes(role),
  );
}

async function requireAuthorizedClientManager(req: NextRequest) {
  const resolved = (await getActorFromRequest(req)) as
    | ActorFromRequestOk
    | ActorFromRequestFail
    | unknown;

  if (!isOk(resolved)) {
    const fail = resolved as ActorFromRequestFail | undefined;

    return {
      ok: false as const,
      response: json(fail?.status ?? 401, {
        ok: false,
        error: fail?.error ?? "UNAUTHENTICATED",
      }),
    };
  }

  const actorId = String(resolved.actor.id);

  const actorRolesResult = await resolved.supaService
    .from("actor_roles")
    .select("actor_id, role_code, state_code")
    .eq("actor_id", actorId)
    .eq("state_code", "OPEN");

  if (actorRolesResult.error) {
    return {
      ok: false as const,
      response: json(500, {
        ok: false,
        error: actorRolesResult.error.message,
      }),
    };
  }

  const rolesSet = new Set<string>();
  const baseRole = normalizeRole(resolved.actor.role);
  if (baseRole) rolesSet.add(baseRole);

  for (const row of (actorRolesResult.data ?? []) as ActorRoleRow[]) {
    const role = normalizeRole(row.role_code);
    if (role) rolesSet.add(role);
  }

  const roles = Array.from(rolesSet);
  const allowed = canManageClientAssignmentsByRole(roles);

  if (!allowed) {
    return {
      ok: false as const,
      response: json(403, {
        ok: false,
        error: "FORBIDDEN_CLIENT_ASSIGNMENTS",
      }),
    };
  }

  return {
    ok: true as const,
    resolved,
    actorId,
    roles,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthorizedClientManager(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => null)) as Payload | null;

    const clientId = String(body?.clientId ?? "").trim();
    const affiliateAccountIdRaw = String(body?.affiliateAccountId ?? "").trim();
    const affiliateAccountId = affiliateAccountIdRaw || null;

    if (!clientId || !isUuid(clientId)) {
      return json(422, {
        ok: false,
        error: "clientId requerido (uuid)",
      });
    }

    if (affiliateAccountId && !isUuid(affiliateAccountId)) {
      return json(422, {
        ok: false,
        error: "affiliateAccountId inválido (uuid)",
      });
    }

    const supaService = getServiceClientOrThrow();

    const clientResult = await supaService
      .from("clients")
      .select("id, name, holded_contact_id")
      .eq("id", clientId)
      .maybeSingle();

    if (clientResult.error) {
      return json(500, {
        ok: false,
        error: clientResult.error.message,
      });
    }

    const client = (clientResult.data ?? null) as ClientRow | null;

    if (!client?.id) {
      return json(404, {
        ok: false,
        error: "CLIENT_NOT_FOUND",
      });
    }

    let affiliate: AffiliateAccountRow | null = null;

    if (affiliateAccountId) {
      const affiliateResult = await supaService
        .from("affiliate_accounts")
        .select("id, name, email, affiliate_external_id, state_code")
        .eq("id", affiliateAccountId)
        .maybeSingle();

      if (affiliateResult.error) {
        return json(500, {
          ok: false,
          error: affiliateResult.error.message,
        });
      }

      affiliate = (affiliateResult.data ?? null) as AffiliateAccountRow | null;

      if (!affiliate?.id) {
        return json(404, {
          ok: false,
          error: "AFFILIATE_NOT_FOUND",
        });
      }
    }

    const existingManualResult = await supaService
      .from("affiliate_attribution_events")
      .select(
        "id, source, source_event_id, client_id, affiliate_account_id, event_hash, created_at, state_code, source_payload",
      )
      .eq("source", "manual_control_room")
      .eq("client_id", clientId)
      .eq("state_code", "OPEN")
      .order("created_at", { ascending: false });

    if (existingManualResult.error) {
      return json(500, {
        ok: false,
        error: existingManualResult.error.message,
      });
    }

    const existingRows = Array.isArray(existingManualResult.data)
      ? existingManualResult.data
      : [];

    const currentAffiliateId =
      existingRows.length > 0
        ? String(existingRows[0]?.affiliate_account_id ?? "").trim() || null
        : null;

    if (currentAffiliateId === affiliateAccountId) {
      return json(200, {
        ok: true,
        changed: false,
        mode: affiliateAccountId ? "set" : "clear",
        clientId,
        affiliateAccountId,
      });
    }

    if (existingRows.length > 0) {
      const deleteIds = existingRows
        .map((row) => String(row.id ?? "").trim())
        .filter(Boolean);

      if (deleteIds.length > 0) {
        const deleteResult = await supaService
          .from("affiliate_attribution_events")
          .delete()
          .in("id", deleteIds);

        if (deleteResult.error) {
          return json(500, {
            ok: false,
            error: deleteResult.error.message,
          });
        }
      }
    }

    if (!affiliateAccountId) {
      return json(200, {
        ok: true,
        changed: true,
        mode: "clear",
        clientId,
        affiliateAccountId: null,
      });
    }

    const nowIso = new Date().toISOString();
    const eventHash = md5(`manual_control_room|client|${clientId}|${affiliateAccountId}`);

    const insertResult = await supaService
      .from("affiliate_attribution_events")
      .insert({
        source: "manual_control_room",
        source_event_id: null,
        source_payload: {
          kind: "client_affiliate_assign",
          client_id: clientId,
          affiliate_account_id: affiliateAccountId,
          actor_id: auth.actorId,
          at: nowIso,
        },
        order_id: null,
        invoice_id: null,
        email_norm: null,
        client_id: clientId,
        affiliate_account_id: affiliateAccountId,
        event_at: nowIso,
        event_hash: eventHash,
        state_code: "OPEN",
      })
      .select("id, client_id, affiliate_account_id, event_hash")
      .maybeSingle();

    if (insertResult.error) {
      return json(500, {
        ok: false,
        error: insertResult.error.message,
      });
    }

    return json(200, {
      ok: true,
      changed: true,
      mode: "set",
      clientId,
      affiliateAccountId,
      eventId: insertResult.data?.id ?? null,
      eventHash: insertResult.data?.event_hash ?? eventHash,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
  }
}