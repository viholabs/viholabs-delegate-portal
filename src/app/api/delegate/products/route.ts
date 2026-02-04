// src/app/api/delegate/products/route.ts
import { NextResponse } from "next/server";
import { getActorFromRequest, json } from "../_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  const { supaRls, actor } = r;

  // Cualquier actor logado puede leer productos (filtrados por active=true)
  const { data, error } = await supaRls
    .from("products")
    .select("id, name, sku, active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) return json(500, { ok: false, error: error.message });

  return NextResponse.json({
    ok: true,
    items: data ?? [],
    actor: { id: actor.id, role: actor.role },
  });
}
