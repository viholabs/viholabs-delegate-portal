// src/lib/fetch-with-auth.ts <<'EOF'
"use client";

import { createClient } from "@/lib/supabase/client";

type JsonRecord = Record<string, unknown>;

let browserSupabase: ReturnType<typeof createClient> | null = null;

function getBrowserSupabase() {
  if (typeof window === "undefined") {
    throw new Error("fetch-with-auth solo puede usarse en componentes cliente");
  }

  if (!browserSupabase) {
    browserSupabase = createClient();
  }

  return browserSupabase;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractErrorMessage(value: unknown, fallback: string): string {
  if (isJsonRecord(value)) {
    const errorValue = value.error;
    if (typeof errorValue === "string" && errorValue.trim()) {
      return errorValue.trim();
    }

    const messageValue = value.message;
    if (typeof messageValue === "string" && messageValue.trim()) {
      return messageValue.trim();
    }
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function safeJsonParse(text: string): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabase();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`No se pudo leer la sesión de Supabase: ${error.message}`);
  }

  const token = session?.access_token?.trim();

  if (!token) {
    throw new Error("No hay access token de Supabase en el navegador");
  }

  return token;
}

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

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