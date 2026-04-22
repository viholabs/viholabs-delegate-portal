"use client";

// Read viholabs_auth_token from cookie — sync, no Supabase client, no getSession() race.
// The cookie is written by the auth callback (server) and kept fresh by
// AuthInterceptorProvider (onAuthStateChange) and the middleware (token rotation).
function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)viholabs_auth_token=([^;]+)/);
  if (!m?.[1]) return null;
  try { return decodeURIComponent(m[1]).trim() || null; } catch { return m[1].trim() || null; }
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractErrorMessage(value: unknown, fallback: string): string {
  if (isJsonRecord(value)) {
    const e = value.error;
    if (typeof e === "string" && e.trim()) return e.trim();
    const m = value.message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function safeJsonParse(text: string): unknown {
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});

  if (!headers.has("Authorization")) {
    const token = getTokenFromCookie();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });
}

export async function fetchJsonWithAuth<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetchWithAuth(input, init);
  const text = await response.text();
  const data = safeJsonParse(text);

  if (!response.ok) {
    throw new Error(extractErrorMessage(data, `HTTP ${response.status}`));
  }

  return data as T;
}
