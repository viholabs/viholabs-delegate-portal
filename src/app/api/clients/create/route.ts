// src/app/api/clients/create/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ===========================
   TYPES
   =========================== */

type CreateClientBody = {
  name: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  province: string;
  country: string;

  surcharge_equivalence: boolean;
  payment_method_id: string;
  iban: string;
};

/* ===========================
   HELPERS
   =========================== */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value.trim();
}

function getSupabaseAdmin() {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key);
}

function getHoldedApiKey(): string {
  const apiKey = process.env.HOLDED_API_KEY;
  if (!apiKey) throw new Error("Missing HOLDED_API_KEY");
  return apiKey.trim();
}

function validateIBAN(iban: string): boolean {
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(clean);
}

function normalizeIBAN(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/* ===========================
   CREATE CONTACT IN HOLDED
   =========================== */

async function createHoldedContact(body: CreateClientBody) {
  const apiKey = getHoldedApiKey();

  const response = await fetch(
    "https://api.holded.com/api/invoicing/v1/contacts",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        key: apiKey,
      },
      body: JSON.stringify({
        name: body.name,
        code: body.nif,
        email: body.email,
        phone: body.phone,
        billAddress: body.address,
        billCity: body.city,
        billProvince: body.province,
        billPostalCode: body.postal_code,
        billCountry: body.country,

        paymentMethod: body.payment_method_id,
        iban: normalizeIBAN(body.iban),
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      `Holded contact creation failed: ${JSON.stringify(payload)}`
    );
  }

  const id =
    payload?.id ||
    payload?._id ||
    payload?.data?.id ||
    payload?.data?._id;

  if (!id) {
    throw new Error("Holded did not return contact id");
  }

  return id as string;
}

/* ===========================
   MAIN
   =========================== */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateClientBody;

    /* ===========================
       VALIDATION (STRICT)
       =========================== */

    if (!body.name) throw new Error("Missing name");
    if (!body.nif) throw new Error("Missing nif");
    if (!body.email) throw new Error("Missing email");
    if (!body.phone) throw new Error("Missing phone");
    if (!body.address) throw new Error("Missing address");
    if (!body.postal_code) throw new Error("Missing postal_code");
    if (!body.city) throw new Error("Missing city");
    if (!body.province) throw new Error("Missing province");
    if (!body.country) throw new Error("Missing country");

    if (typeof body.surcharge_equivalence !== "boolean") {
      throw new Error("surcharge_equivalence must be boolean");
    }

    if (!body.payment_method_id) {
      throw new Error("Missing payment_method_id");
    }

    if (!body.iban || !validateIBAN(body.iban)) {
      throw new Error("Invalid IBAN");
    }

    /* ===========================
       CREATE IN HOLDED
       =========================== */

    const holded_contact_id = await createHoldedContact(body);

    /* ===========================
       SAVE IN SUPABASE
       =========================== */

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: body.name,
        nif: body.nif,
        email: body.email,
        phone: body.phone,
        address: body.address,
        postal_code: body.postal_code,
        city: body.city,
        province: body.province,
        country: body.country,

        surcharge_equivalence: body.surcharge_equivalence,
        payment_method_id: body.payment_method_id,
        iban: normalizeIBAN(body.iban),

        holded_contact_id,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 400 }
    );
  }
}