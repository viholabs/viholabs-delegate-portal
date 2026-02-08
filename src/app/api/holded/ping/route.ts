import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/app/api/delegate/_utils";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normalizeRole(role: any): string {
  return String(role ?? "").trim().toLowerCase();
}

export async function GET(req: Request) {
  let stage = "init";

  try {
    // 1) Auth portal (Bearer Supabase) + actor
    stage = "auth_actor";
    const ar: any = await getActorFromRequest(req);
    if (!ar?.ok) {
      return json(ar?.status ?? 401, { ok: false, stage, error: ar?.error ?? "Unauthorized" });
    }

    const roleRaw = ar?.actor?.role ?? "";
    const role = normalizeRole(roleRaw);

    // Aceptamos variantes comunes
    const allowed = new Set(["super_admin", "admin", "superadmin"]);
    if (!allowed.has(role)) {
      return json(403, { ok: false, stage, error: "Forbidden (admin only)", role_raw: roleRaw, role_norm: role });
    }

    // 2) Env config (NO mostramos secretos)
    stage = "env";
    const baseUrl = (process.env.HOLDED_BASE_URL ?? "https://api.holded.com").replace(/\/+$/, "");
    const docType = process.env.HOLDED_DOC_TYPE ?? "invoice";
    const apiKey = process.env.HOLDED_API_KEY ?? "";

    if (!apiKey || apiKey === "RELLENAR_EN_LOCAL_NO_PEGAR_EN_CHAT") {
      return json(500, {
        ok: false,
        stage,
        error: "Falta HOLDED_API_KEY en el servidor. Rellénala en .env.local (sin pegarla en el chat).",
        base_url: baseUrl,
        doc_type: docType,
      });
    }

    // 3) Call HOLDed API (List Documents)
    stage = "fetch_holded";
    const url = `${baseUrl}/api/invoicing/v1/documents/${encodeURIComponent(docType)}?page=1`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        key: apiKey, // HOLDed usa header "key" con la API key
      } as any,
      cache: "no-store",
    });

    const rawText = await resp.text();
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = { non_json: true, rawText: rawText?.slice(0, 500) };
    }

    if (!resp.ok) {
      return json(resp.status, {
        ok: false,
        stage,
        error: "HOLDed API error",
        http_status: resp.status,
        base_url: baseUrl,
        doc_type: docType,
        sample: data,
      });
    }

    const list = Array.isArray(data) ? data : (data?.data ?? data?.results ?? []);
    const sample0 = Array.isArray(list) ? list[0] : null;

    return json(200, {
      ok: true,
      stage: "ok",
      holded: {
        base_url: baseUrl,
        doc_type: docType,
        page: 1,
        count: Array.isArray(list) ? list.length : null,
        sample_first: sample0 ? { id: sample0.id ?? null, number: sample0.number ?? sample0.num ?? null } : null,
      },
      actor: { id: ar.actor?.id, role: roleRaw, name: ar.actor?.name ?? ar.actor?.email ?? "—" },
    });
  } catch (e: any) {
    return json(500, { ok: false, stage, error: e?.message ?? "Error inesperado" });
  }
}