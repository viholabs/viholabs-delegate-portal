import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "missing_credentials" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
    }

    const cookieStore = await cookies();

    // IMPORTANT:
    // La mateixa response ha de ser la que rebi les cookies SSR de Supabase
    // i la que retornem al client.
    const response = NextResponse.json({ ok: true }, { status: 200 });

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const c of cookiesToSet) {
            response.cookies.set(c.name, c.value, c.options);
          }
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim(),
      password: String(password),
    });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "auth_failed",
          message: error.message,
        },
        { status: 401 },
      );
    }

    if (!data?.session) {
      return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: err?.message ?? "unknown",
      },
      { status: 500 },
    );
  }
}