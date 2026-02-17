// src/lib/holded/holdedFetch.ts
/**
 * VIHOLABS — HOLDed (Canonical Fetch)
 *
 * Goals (non-negotiable):
 * - Single entry-point for all Holded HTTP calls (no scattered fetch).
 * - Strong failure semantics (never silent).
 * - Timeout + retry for transient errors.
 * - Node runtime only (server-side). NEVER expose API key to client.
 *
 * ENV required:
 * - HOLDED_API_KEY
 */

export const HOLDED_API_BASE = "https://api.holded.com";

export type HoldedFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  timeoutMs?: number;
  // max retries for transient failures (429/5xx/timeouts)
  retries?: number;
  // optional for idempotency / correlation
  requestId?: string;
};

export class HoldedError extends Error {
  public readonly status: number | null;
  public readonly code:
    | "CONFIG"
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP"
    | "RATE_LIMIT"
    | "PARSE";
  public readonly url: string;
  public readonly responseText?: string;

  constructor(args: {
    message: string;
    code: HoldedError["code"];
    url: string;
    status: number | null;
    responseText?: string;
  }) {
    super(args.message);
    this.name = "HoldedError";
    this.code = args.code;
    this.url = args.url;
    this.status = args.status;
    this.responseText = args.responseText;
  }
}

function buildUrl(path: string, query?: HoldedFetchOptions["query"]) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${HOLDED_API_BASE}${p}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransient(status: number) {
  // Retry on 429 + 5xx
  return status === 429 || (status >= 500 && status <= 599);
}

export async function holdedFetchJson<T = unknown>(
  path: string,
  opts: HoldedFetchOptions = {}
): Promise<T> {
  const apiKey = process.env.HOLDED_API_KEY;
  if (!apiKey || String(apiKey).trim().length < 10) {
    throw new HoldedError({
      message: "HOLDED_API_KEY missing or invalid (server env)",
      code: "CONFIG",
      url: buildUrl(path, opts.query).toString(),
      status: null,
    });
  }

  const method = opts.method ?? "GET";
  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 12_000;
  const retries = typeof opts.retries === "number" ? opts.retries : 2;

  const url = buildUrl(path, opts.query);
  const requestId = opts.requestId ?? undefined;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          key: apiKey,
          accept: "application/json",
          ...(requestId ? { "x-request-id": requestId } : {}),
          ...(opts.body ? { "content-type": "application/json" } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const code: HoldedError["code"] =
          res.status === 429 ? "RATE_LIMIT" : "HTTP";

        // Retry only if transient and we still have attempts left
        if (isTransient(res.status) && attempt <= retries + 1) {
          // backoff: 400ms, 900ms, 1600ms...
          const backoff = 250 + attempt * attempt * 150;
          await sleep(backoff);
          continue;
        }

        throw new HoldedError({
          message: `Holded HTTP error ${res.status}`,
          code,
          url: url.toString(),
          status: res.status,
          responseText: text,
        });
      }

      // parse JSON robustly
      try {
        return (await res.json()) as T;
      } catch (e) {
        const text = await res.text().catch(() => "");
        throw new HoldedError({
          message: "Holded JSON parse error",
          code: "PARSE",
          url: url.toString(),
          status: res.status,
          responseText: text,
        });
      }
    } catch (e: any) {
      clearTimeout(timeoutId);

      // Timeout / abort
      if (e?.name === "AbortError") {
        if (attempt <= retries + 1) {
          const backoff = 250 + attempt * attempt * 150;
          await sleep(backoff);
          continue;
        }
        throw new HoldedError({
          message: `Holded request timeout after ${timeoutMs}ms`,
          code: "TIMEOUT",
          url: url.toString(),
          status: null,
        });
      }

      // Network or other fetch error
      if (attempt <= retries + 1) {
        const backoff = 250 + attempt * attempt * 150;
        await sleep(backoff);
        continue;
      }

      throw new HoldedError({
        message: `Holded network error: ${String(e?.message ?? e)}`,
        code: "NETWORK",
        url: url.toString(),
        status: null,
      });
    }
  }
}
