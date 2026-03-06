// src/app/api/delegate/products/route.ts

import { NextResponse } from "next/server";
import { getActorFromRequest, json } from "../_utils";
import { getEffectivePermissionsByActorId } from "@/lib/auth/permissions";

export const runtime = "nodejs";

type BundleItem = {
  sku: string;
  quantity: number;
  unit_price_override: number | null;
};

type BundleDef = {
  sku: string;
  title: string | null;
  description: string | null;
  items: BundleItem[];
};

function buildBundleItems(bundleSku: string): BundleItem[] {
  switch (bundleSku) {
    case "VIHO-BOOK-BASCULA":
      return [
        {
          sku: "VIHO-BOOK-BASCULA",
          quantity: 1,
          unit_price_override: null,
        },
      ];

    case "VIHO-OBE-PROMO-001":
      return [
        {
          sku: "VIHO-OBE-SPRAY-002",
          quantity: 6,
          unit_price_override: 31,
        },
        {
          sku: "VIHO-OBE-PROMO-001",
          quantity: 1,
          unit_price_override: 0,
        },
      ];

    case "VIHO-OBE-PROMO-002":
      return [
        {
          sku: "VIHO-OBE-SPRAY-002",
          quantity: 12,
          unit_price_override: 31,
        },
        {
          sku: "VIHO-OBE-PROMO-002",
          quantity: 3,
          unit_price_override: 0,
        },
      ];

    case "VIHO-OBE-PROMO-003":
      return [
        {
          sku: "VIHO-OBE-SPRAY-002",
          quantity: 22,
          unit_price_override: 31,
        },
        {
          sku: "VIHO-OBE-PROMO-003",
          quantity: 6,
          unit_price_override: 0,
        },
      ];

    case "VIHO-OBE-PROMO-PLUS-4M":
      return [
        {
          sku: "VIHO-OBE-SPRAY-002",
          quantity: 22,
          unit_price_override: 31,
        },
        {
          sku: "VIHO-OBE-PROMO-PLUS-4M",
          quantity: 6,
          unit_price_override: 0,
        },
      ];

    case "VIHO-OBE-PROMO-CP-12M":
      return [
        {
          sku: "VIHO-OBE-SPRAY-002",
          quantity: 100,
          unit_price_override: 31,
        },
        {
          sku: "VIHO-OBE-PROMO-CP-12M",
          quantity: 30,
          unit_price_override: 0,
        },
      ];

    default:
      return [];
  }
}

export async function GET(req: Request) {
  const r = await getActorFromRequest(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });

  let stage = "init";

  try {
    stage = "effective_permissions";
    const eff = await getEffectivePermissionsByActorId(String(r.actor.id));

    stage = "authorize";
    const allowed = eff.isSuperAdmin || eff.has("products.read");
    if (!allowed) {
      return json(403, { ok: false, stage, error: "No autorizado (products.read)" });
    }

    const reader = r.supaService;

    // 1) Bundles activos = fuente canónica de packs visibles
    stage = "bundles";
    const { data: rawBundles, error: bErr } = await reader
      .from("product_bundles")
      .select("bundle_sku, title, description, active")
      .eq("active", true)
      .order("title", { ascending: true });

    if (bErr) {
      return json(500, { ok: false, stage, error: bErr.message });
    }

    // 2) Producto simple visible real: spray
    stage = "spray";
    const { data: rawSpray, error: pErr } = await reader
      .from("products")
      .select("id, sku, name, active")
      .eq("active", true)
      .eq("sku", "VIHO-OBE-SPRAY-002")
      .limit(1);

    if (pErr) {
      return json(500, { ok: false, stage, error: pErr.message });
    }

    const bundles: BundleDef[] = Array.isArray(rawBundles)
      ? rawBundles.map((b: any) => ({
          sku: String(b?.bundle_sku ?? "").trim(),
          title: b?.title ?? null,
          description: b?.description ?? null,
          items: buildBundleItems(String(b?.bundle_sku ?? "").trim()),
        }))
      : [];

    // Catálogo visible EXACTAMENTE como en Holded:
    // - bundles activos
    // - spray real
    const bundleProducts = bundles.map((b) => ({
      id: b.sku,
      sku: b.sku,
      name: b.title ?? b.sku,
      description: b.description ?? null,
      is_bundle: true,
    }));

    const sprayProducts = Array.isArray(rawSpray)
      ? rawSpray.map((p: any) => ({
          id: p?.id ?? null,
          sku: String(p?.sku ?? "").trim(),
          name: p?.name ?? null,
          description: "Viho® Obeglutide Spray Complemento...",
          is_bundle: false,
        }))
      : [];

    const products = [...bundleProducts, ...sprayProducts];

    return NextResponse.json({
      ok: true,
      products,
      bundles,
      visible_skus: products.map((p) => p.sku),
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      stage,
      error: e?.message ?? "Error inesperado en products",
    });
  }
}