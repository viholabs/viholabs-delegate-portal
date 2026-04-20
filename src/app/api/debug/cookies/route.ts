import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Debug endpoint to check if session cookies are being set
 * Visit /api/debug/cookies to see what's available
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  return NextResponse.json({
    cookiesCount: allCookies.length,
    cookies: allCookies.map((c) => ({
      name: c.name,
      value: c.value.substring(0, 50) + (c.value.length > 50 ? "..." : ""),
    })),
    headers: {
      cookie: req.headers.get("cookie"),
      host: req.headers.get("host"),
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer"),
    },
  });
}
