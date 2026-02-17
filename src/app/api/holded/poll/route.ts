// src/app/api/holded/poll/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function resolveActorIdLoose(actorAny: any): string | null {
  if (!actorAny) return null;

  // direct fields
  const a =
    actorAny.actor_id ??
    actorAny.actorId ??
    actorAny.id ??
    actorAny.actor?.actor_id ??
    actorAny.actor?.actorId ??
    actorAny.actor?.id;

  if (a == null) return null;

  const s = String(a).trim();
  return s.length ? s : null;
}

function normalizeAuthErrorMessage(raw: any): string {
  const msg = String(raw ?? "Unauthorized").trim();
  return msg.length ? msg : "Unauthorized";
}

export async function GET(req: Request) {
  try {
    const ar: any = await getActorFromRequest(req);

    // getActorFromRequest usually returns:
    // { ok:false, status:401, error:"Missing Bearer token" }  OR  { ok:true, actor:{...} } / {...}
    if (!ar || ar.ok === false) {
      const status = Number(ar?.status ?? 401) || 401;
      const err = normalizeAuthErrorMessage(ar?.error);

      // enforce canonical expected message for no-token case
      if (err === "Missing Bearer token") {
        return json(401, { ok: false, stage: "auth_actor", error: "Missing Bearer token" });
      }

      return json(status, { ok: false, stage: "auth_actor", error: err });
    }

    const actorId = resolveActorIdLoose(ar);
    if (!actorId) {
      return json(401, { ok: false, stage: "auth_actor", error: "Missing actor id" });
    }

    // Minimal, deterministic “poll ok” payload (no side-effects, no fetchers)
    return json(200, {
      ok: true,
      stage: "ok",
      actorId,
    });
  } catch (e: any) {
    const msg = normalizeAuthErrorMessage(e?.message);
    return json(500, { ok: false, stage: "unhandled", error: msg });
  }
}
