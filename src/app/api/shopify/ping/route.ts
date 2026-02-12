import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const ver = process.env.SHOPIFY_API_VERSION || "2026-01";

  if (!shop) return NextResponse.json({ ok: false, error: "MISSING_SHOPIFY_SHOP_DOMAIN" }, { status: 500 });
  if (!token) return NextResponse.json({ ok: false, error: "MISSING_SHOPIFY_ADMIN_ACCESS_TOKEN" }, { status: 500 });

  const url = `https://${shop}/admin/api/${ver}/shop.json`;

  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch {}

  return NextResponse.json(
    { ok: res.ok, status: res.status, shop_domain: shop, api_version: ver, data },
    { status: res.ok ? 200 : 502 }
  );
}
