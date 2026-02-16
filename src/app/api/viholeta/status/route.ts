// src/app/api/viholeta/status/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Requereix sessió (authenticated). Status és institucional però no públic.
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return json(401, { ok: false, error: "unauthorized" });
    }

    // 1) Versió activa (funció canònica)
    const v = await supabase.rpc("viholeta_corpus_version_current");
    const corpus_version =
      (v.data && typeof v.data === "string" && v.data.trim()) ? v.data.trim() : "unknown";

    // 2) Salut corpus (barat): READY chunks
    const readyQ = await supabase
      .from("viholeta_corpus")
      .select("id", { count: "exact", head: true })
      .eq("embedding_state", "READY");

    const ready_count = typeof readyQ.count === "number" ? readyQ.count : null;

    // 3) Retrieval state (simplificat, canònic): operational si hi ha READY
    const retrieval_state =
      ready_count !== null && ready_count > 0 ? "operational" : "degraded";

    // 4) Epistemic enforcement: assumim enforced (per la teva canònica validada)
    const epistemic_policy = "enforced";

    // 5) Regime: aquí NO decidim permisos al frontend.
    // El frontend pot fer /consult sempre; /run serà 403 si no autoritzat.
    // Tot i així, exposem "consultation_available" com a estat institucional.
    const regime = "consultation_available";

    // Nota: No exposem hashes, distances, vectors, latències, ni IDs interns.
    return json(200, {
      ok: true,
      viholeta: {
        corpus_version,
        retrieval_state,
        epistemic_policy,
        regime,
        corpus: {
          ready_chunks: ready_count,
        },
      },
    });
  } catch (e) {
    // Error institucional (no stack traces)
    return json(200, {
      ok: false,
      viholeta: {
        retrieval_state: "degraded",
        epistemic_policy: "unknown",
      },
      error: asErrorMessage(e),
    });
  }
}
