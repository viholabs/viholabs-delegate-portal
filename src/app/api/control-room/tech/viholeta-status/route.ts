// src/app/api/control-room/tech/viholeta-status/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

type SessionRow = {
  id: string;
  actor_id: string;
  mode: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

function computeState(lastCreatedAtISO: string | null): "OK" | "IDLE" | "UNKNOWN" {
  if (!lastCreatedAtISO) return "IDLE";
  const t = Date.parse(lastCreatedAtISO);
  if (!Number.isFinite(t)) return "UNKNOWN";

  const ageMs = Date.now() - t;

  // Heurística institucional (no tècnica):
  // - si hi ha activitat en últimes 48h => OK
  // - si no => IDLE
  const H48 = 48 * 60 * 60 * 1000;
  return ageMs <= H48 ? "OK" : "IDLE";
}

function computeActivity(sessions: SessionRow[]) {
  const n = Array.isArray(sessions) ? sessions.length : 0;
  const last = n ? sessions[0] : null;
  const first = n ? sessions[n - 1] : null;

  // “ritme” simple: sessions recuperades + finestra temporal entre primera i última
  let window_hours: number | null = null;
  if (last?.created_at && first?.created_at) {
    const a = Date.parse(last.created_at);
    const b = Date.parse(first.created_at);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= b) {
      window_hours = Math.round(((a - b) / (1000 * 60 * 60)) * 10) / 10;
    }
  }

  // modes presents (OPS/...)
  const modes = Array.from(new Set(sessions.map((s) => s.mode))).slice(0, 5);

  return {
    sessions_in_view: n,
    window_hours,
    modes,
  };
}

/**
 * VIHOLABS — Viholeta Status (Observability)
 * - Lectura institucional, no debugging
 * - Font: viholeta_sessions (últimes N sessions)
 * - Mai 500 (evitem histerisme)
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: sessions, error } = await supabase
      .from("viholeta_sessions")
      .select("id, actor_id, mode, title, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      return json(200, { ok: true, state: "UNKNOWN", last_session: null, sessions: [], activity: null });
    }

    const rows = (Array.isArray(sessions) ? sessions : []) as SessionRow[];
    const last = rows.length ? rows[0] : null;

    const state = computeState(last?.created_at ?? null);
    const activity = computeActivity(rows);

    return json(200, {
      ok: true,
      state,
      last_session: last,
      sessions: rows,
      activity,
      // Errors semàntics: no tenim cap font real per sessions -> buit.
      errors: [],
    });
  } catch {
    return json(200, { ok: true, state: "UNKNOWN", last_session: null, sessions: [], activity: null, errors: [] });
  }
}
