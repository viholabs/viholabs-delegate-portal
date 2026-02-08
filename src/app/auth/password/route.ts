import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

/**
 * Tipus explícit per evitar "implicit any" a cookiesToSet.
 * Això evita errors de TypeScript i fa el contracte clar per manteniment/externalització.
 */
type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return json(400, { ok: false, error: "missing_credentials" });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      return json(500, { ok: false, error: "missing_supabase_env" });
    }

    /**
     * IMPORTANT (Next 15):
     * cookies() és ASYNC i retorna una Promise.
     * Si no fem await, TypeScript veu Promise<...> i no existeixen getAll/set.
     */
    const cookieStore = await cookies();

    /**
     * Supabase SSR client:
     * - llegeix cookies de la request
     * - escriu cookies a la response
     * Això és el que fa que la sessió quedi establerta en SSR (bloc tancat: "Auth SSR cookies").
     */
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const c of cookiesToSet) {
            cookieStore.set(c.name, c.value, c.options);
          }
        },
      },
    });

    // Login amb email + password (server-side) per establir cookies SSR
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim(),
      password: String(password),
    });

    if (error) {
      return json(401, { ok: false, error: "auth_failed", message: error.message });
    }

    if (!data?.session) {
      return json(401, { ok: false, error: "no_session" });
    }

    // Sessió establerta correctament en cookies SSR
    return json(200, { ok: true });
  } catch (err: any) {
    return json(500, {
      ok: false,
      error: "server_error",
      message: err?.message ?? "unknown",
    });
  }
}
