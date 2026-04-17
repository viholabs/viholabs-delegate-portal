// src/app/api/control-room/me/route.ts
// GET /api/control-room/me
// Returns the calling actor's role and permissions.

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";
import { normalizeRole } from "@/lib/auth/roles";
import { asString } from "@/lib/holded/holdedPrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = (await getActorFromRequest(req)) as {
    ok?: boolean;
    status?: number;
    error?: string;
    actor?: unknown;
  };

  if (!auth?.ok) {
    return NextResponse.json(
      { ok: false, error: auth?.error ?? "Unauthorized" },
      { status: auth?.status ?? 401 }
    );
  }

  const row = auth.actor as Record<string, unknown> | null | undefined;
  const role = normalizeRole(asString(row?.role));

  return NextResponse.json(
    {
      ok: true,
      actorId: asString(row?.id),
      role,
      isMelquisedec: role === "MELQUISEDEC",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
