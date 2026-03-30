/* scripts/holded-sync-contacts.ts
   CANON VIHOLABS — Holded contacts → Portal contacts (G1)
   - Source of truth: Holded
   - No heuristics
   - Idempotent upsert via Supabase RPC: public.viho_upsert_holded_contact(jsonb)
   - No pg dependency
*/

import "dotenv/config";

type HoldedContact = Record<string, any>;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function safeSnippet(s: string, maxLen = 600): string {
  const clean = String(s || "").replace(/\s+/g, " ").trim();
  return clean.length <= maxLen ? clean : clean.slice(0, maxLen) + "…";
}

function isLikelyJson(text: string): boolean {
  const t = String(text || "").trim();
  return t.startsWith("{") || t.startsWith("[");
}

async function fetchText(url: string, headers: Record<string, string>): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  finalUrl: string;
  text: string;
  headersObj: Record<string, string>;
}> {
  const res = await fetch(url, { headers, redirect: "follow" });
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text().catch(() => "");

  const headersObj: Record<string, string> = {};
  for (const [k, v] of res.headers.entries()) headersObj[k] = v;

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    contentType,
    finalUrl: res.url,
    text,
    headersObj,
  };
}

async function fetchJsonOrExplain<T>(
  url: string,
  headers: Record<string, string>,
  context: string
): Promise<T> {
  const r = await fetchText(url, headers);

  if (!r.ok) {
    throw new Error(
      `HTTP ${r.status} ${r.statusText} | ctx=${context} | content-type=${r.contentType} | url=${url} | body=${safeSnippet(
        r.text
      )}`
    );
  }

  // OK but not JSON -> explain
  if (!isLikelyJson(r.text)) {
    throw new Error(
      [
        `NON-JSON RESPONSE with HTTP ${r.status} (expected JSON)`,
        `ctx=${context}`,
        `url=${url}`,
        `final_url=${r.finalUrl}`,
        `content-type=${r.contentType}`,
        `body_snippet=${safeSnippet(r.text)}`,
        `headers_snippet=${safeSnippet(JSON.stringify(r.headersObj))}`,
      ].join(" | ")
    );
  }

  try {
    return JSON.parse(r.text) as T;
  } catch (e: any) {
    throw new Error(
      `JSON PARSE FAILED | ctx=${context} | url=${url} | content-type=${r.contentType} | body=${safeSnippet(
        r.text
      )} | err=${e?.message || e}`
    );
  }
}

async function supabaseRpcUpsertHoldedContact(
  supabaseUrl: string,
  serviceKey: string,
  holdedPayload: any
): Promise<void> {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/viho_upsert_holded_contact`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "viholabs-portal/1.0",
    },
    body: JSON.stringify({ p: holdedPayload }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Supabase RPC error HTTP ${res.status} ${res.statusText} — ${safeSnippet(text, 900)}`);
  }
}

async function supabaseCountOperationalContacts(
  supabaseUrl: string,
  serviceKey: string
): Promise<string> {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url = `${base}/rest/v1/v_contacts_operational?select=id`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: "application/json",
      prefer: "count=exact",
      "user-agent": "viholabs-portal/1.0",
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Supabase count error HTTP ${res.status} — ${safeSnippet(text, 900)}`);
  }

  const contentRange = res.headers.get("content-range") || "";
  const m = contentRange.match(/\/(\d+)\s*$/);
  return m?.[1] ?? "?";
}

async function main() {
  const HOLDED_BASE_URL = (process.env.HOLDED_BASE_URL?.trim() || "https://api.holded.com").replace(/\/+$/, "");
  const HOLDED_API_KEY = requireEnv("HOLDED_API_KEY");

  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const limit = Number(process.env.HOLDED_CONTACTS_LIMIT || "50");
  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
    throw new Error(`Invalid HOLDED_CONTACTS_LIMIT=${process.env.HOLDED_CONTACTS_LIMIT} (use 1..200)`);
  }

  console.log("=== VIHOLABS CONTACT SYNC (CANON, no-pg) ===");
  console.log(`HOLDED_BASE_URL=${HOLDED_BASE_URL}`);
  console.log(`HOLDED_CONTACTS_LIMIT=${limit}`);
  console.log(`SUPABASE_URL_SET=yes`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY_SET=yes`);

  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;

  const holdedHeaders = {
    accept: "application/json",
    key: HOLDED_API_KEY, // Holded API uses header "key"
    "user-agent": "viholabs-portal/1.0",
  };

  // Canon endpoint per Holded docs: /api/invoicing/v1/contacts
  // We still keep page/limit for safety; if Holded ignores them, ok.
  const canonicalPath = "/api/invoicing/v1/contacts";

  while (true) {
    const url = `${HOLDED_BASE_URL}${canonicalPath}?page=${page}&limit=${limit}`;

    let batch: HoldedContact[] = [];
    try {
      batch = await fetchJsonOrExplain<HoldedContact[]>(url, holdedHeaders, "holded_list_contacts");
    } catch (e: any) {
      // If we got HTML widget, fail with a very explicit message
      const msg = String(e?.message || e);
      throw new Error(
        [
          msg,
          "CANON HINT: If you see <div id=\"root-widget\"> then you are hitting a frontend route.",
          `Use endpoint: ${HOLDED_BASE_URL}${canonicalPath}`,
        ].join(" | ")
      );
    }

    if (!Array.isArray(batch)) {
      throw new Error(`Holded returned non-array for contacts | url=${url}`);
    }

    console.log(`\n-- page=${page} fetched=${batch.length} --`);
    totalFetched += batch.length;

    if (batch.length === 0) break;

    for (const c of batch) {
      const holdedId = c?.id;
      if (!holdedId || typeof holdedId !== "string") {
        console.warn(`SKIP: contact without valid id | body_snippet=${safeSnippet(JSON.stringify(c))}`);
        continue;
      }

      await supabaseRpcUpsertHoldedContact(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, c);
      totalUpserted += 1;
    }

    if (batch.length < limit) break;
    page += 1;
  }

  console.log("\n=== DONE ===");
  console.log(`totalFetched=${totalFetched}`);
  console.log(`totalUpsertedCalls=${totalUpserted}`);

  const cnt = await supabaseCountOperationalContacts(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log(`v_contacts_operational.count=${cnt}`);
}

main().catch((err) => {
  console.error("\nFATAL:", err?.message || err);
  process.exit(1);
});