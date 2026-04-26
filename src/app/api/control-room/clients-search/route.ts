import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardContext } from "@/lib/control-room/resolveDashboardContext";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(req: NextRequest) {
  const ctx = await resolveDashboardContext(req);
  if (!ctx.ok) return json(ctx.status, { ok: false, error: ctx.error });
  if (!ctx.permissions.canViewGlobal) return json(403, { ok: false, error: "Acceso restringido" });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json(200, { ok: true, clients: [] });

  const supa = ctx.supaService;
  const search = `%${q}%`;

  const { data, error } = await supa
    .from("clients")
    .select("id, name, contact_email, status")
    .or(`name.ilike.${search},contact_email.ilike.${search}`)
    .order("name", { ascending: true })
    .limit(20);

  if (error) return json(500, { ok: false, error: error.message });

  return json(200, {
    ok: true,
    clients: (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.contact_email,
      status: c.status,
    })),
  });
}
