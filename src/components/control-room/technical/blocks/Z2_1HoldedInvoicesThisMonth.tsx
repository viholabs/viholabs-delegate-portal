//src/components/control-room/technical/blocks/Z2_1HoldedInvoicesThisMonth.tsx <<'EOF'
"use client";

/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Actor: VIHOLABS_TECH_BLOCK_AGENT_Z2
 * Reason: Z2.1 showed "no invoices this month" due to non-auth fetch / redirects; enforce client-side relative fetch + robust date parsing.
 * Scope: Z2.1 Holded invoices card only (no API changes, no shell/layout changes).
 */

import { useEffect, useMemo, useState } from "react";

type AnyObj = Record<string, any>;

type UiInvoice = {
  key: string;
  dateISO?: string; // YYYY-MM-DD
  number?: string;
  customerMasked?: string;
  totalEUR?: number;
};

function isObject(x: any): x is AnyObj {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function asArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (isObject(payload)) {
    // common shapes: { invoices: [...] } | { data: [...] } | { results: [...] }
    for (const k of ["invoices", "data", "results", "items"]) {
      if (Array.isArray(payload[k])) return payload[k];
    }
  }
  return [];
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  // Use local calendar date (UI expectation).
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateToISO(value: any): string | undefined {
  if (value == null) return undefined;

  // Date instance
  if (value instanceof Date && !isNaN(value.getTime())) return toISODate(value);

  // Numeric timestamp (ms or seconds)
  if (typeof value === "number" && isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return toISODate(d);
    return undefined;
  }

  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;

  // ISO-like: YYYY-MM-DD...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const dd = pad2(Number(dmy[1]));
    const mm = pad2(Number(dmy[2]));
    const yyyy = dmy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Try Date.parse (last resort)
  const t = Date.parse(s);
  if (!isNaN(t)) return toISODate(new Date(t));

  return undefined;
}

function pickDateISO(inv: AnyObj): string | undefined {
  // Try common fields without assuming contract.
  const candidates = [
    inv.date,
    inv.fecha,
    inv.issue_date,
    inv.issueDate,
    inv.invoice_date,
    inv.invoiceDate,
    inv.created_at,
    inv.createdAt,
    inv.updated_at,
    inv.updatedAt,
    inv.emitted_at,
    inv.emittedAt,
  ];

  for (const v of candidates) {
    const iso = parseDateToISO(v);
    if (iso) return iso;
  }

  // nested common structures
  if (isObject(inv.meta)) {
    for (const k of ["date", "fecha", "issueDate", "invoiceDate", "createdAt"]) {
      const iso = parseDateToISO(inv.meta[k]);
      if (iso) return iso;
    }
  }

  return undefined;
}

function pickNumber(inv: AnyObj): string | undefined {
  const v =
    inv.number ??
    inv.invoice_number ??
    inv.invoiceNumber ??
    inv.code ??
    inv.reference ??
    inv.ref ??
    inv.id;
  if (v == null) return undefined;
  return String(v).trim() || undefined;
}

function pickTotalEUR(inv: AnyObj): number | undefined {
  // Keep it conservative: total / total_eur / total_amount / amount / totalWithTax...
  const raw =
    inv.total ??
    inv.total_eur ??
    inv.totalEUR ??
    inv.total_amount ??
    inv.totalAmount ??
    inv.amount ??
    inv.amount_eur ??
    inv.amountEUR ??
    inv.total_with_tax ??
    inv.totalWithTax;

  if (raw == null) return undefined;

  if (typeof raw === "number" && isFinite(raw)) return raw;

  if (typeof raw === "string") {
    // "204,60€" | "204.60" | "204,60"
    const cleaned = raw.replace(/[^\d,.\-]/g, "").trim();
    if (!cleaned) return undefined;

    // If contains comma and dot, assume dot thousands, comma decimals => remove dots, replace comma with dot
    let norm = cleaned;
    const hasComma = norm.includes(",");
    const hasDot = norm.includes(".");
    if (hasComma && hasDot) {
      norm = norm.replace(/\./g, "").replace(",", ".");
    } else if (hasComma && !hasDot) {
      norm = norm.replace(",", ".");
    }
    const n = Number(norm);
    if (isFinite(n)) return n;
  }

  return undefined;
}

function maskCustomer(inv: AnyObj): string | undefined {
  // DO NOT expose PII. We only show a neutral token (e.g., "Client · **A").
  const raw =
    inv.customer_name ??
    inv.customerName ??
    inv.client_name ??
    inv.clientName ??
    inv.customer ??
    inv.client ??
    (isObject(inv.contact) ? inv.contact.name : undefined) ??
    (isObject(inv.client) ? inv.client.name : undefined);

  if (raw == null) return "Client";
  const s = String(raw).trim();
  if (!s) return "Client";

  // Take first letter only
  const first = s.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 1).toUpperCase();
  return first ? `Client · ${first}…` : "Client";
}

function monthKeyNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function fmtEUR(n: number): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}

export default function Z2_1HoldedInvoicesThisMonth() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawInvoices, setRawInvoices] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        // IMPORTANT: relative URL to avoid tunnel auth redirects in server-side contexts.
        const res = await fetch("/api/holded/invoices", {
          method: "GET",
          credentials: "include",
          headers: { accept: "application/json" },
        });

        const ct = res.headers.get("content-type") || "";

        // If we got redirected HTML, treat as honest failure (no stack traces).
        if (!res.ok) {
          throw new Error(`Holded invoices no disponible (${res.status})`);
        }
        if (!ct.toLowerCase().includes("application/json")) {
          // Some proxies return HTML on auth issues.
          throw new Error("Holded invoices no disponible (resposta no JSON)");
        }

        const json = await res.json();
        const items = asArray(json);

        if (!cancelled) {
          setRawInvoices(items);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRawInvoices([]);
          setError(e?.message || "Holded invoices no disponible");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const nowMonth = useMemo(() => monthKeyNow(), []);
  const uiInvoices = useMemo<UiInvoice[]>(() => {
    const list: UiInvoice[] = [];

    for (const inv of rawInvoices) {
      if (!isObject(inv)) continue;

      const dateISO = pickDateISO(inv);
      const number = pickNumber(inv);
      const totalEUR = pickTotalEUR(inv);
      const customerMasked = maskCustomer(inv);

      const key = String(inv.id ?? inv.uuid ?? number ?? `${dateISO ?? "no-date"}:${Math.random()}`);

      list.push({ key, dateISO, number, totalEUR, customerMasked });
    }

    // Sort by date desc (unknown dates go last)
    list.sort((a, b) => {
      const ad = a.dateISO ? Date.parse(a.dateISO) : -Infinity;
      const bd = b.dateISO ? Date.parse(b.dateISO) : -Infinity;
      return bd - ad;
    });

    return list;
  }, [rawInvoices]);

  const thisMonth = useMemo(() => {
    return uiInvoices.filter((x) => (x.dateISO ? x.dateISO.startsWith(nowMonth) : false));
  }, [uiInvoices, nowMonth]);

  const top8 = useMemo(() => thisMonth.slice(0, 8), [thisMonth]);

  // --- UI (executive, no raw logs) ---
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white/70 px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium tracking-wide text-neutral-700">
            Holded (Z2.1) · Factures del mes en curs
          </div>
          <div className="mt-1 text-[22px] font-semibold text-neutral-900">
            {loading ? "…" : `${thisMonth.length}`}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-600">
            Mes: <span className="font-medium text-neutral-800">{nowMonth}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[11px] text-neutral-500">Estat</div>
          <div
            className={[
              "mt-1 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium",
              loading
                ? "bg-neutral-100 text-neutral-700"
                : error
                  ? "bg-amber-100 text-amber-900"
                  : "bg-emerald-100 text-emerald-900",
            ].join(" ")}
          >
            {loading ? "Carregant" : error ? "Degradat" : "OK"}
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-neutral-200 pt-3">
        {loading ? (
          <div className="text-[12px] text-neutral-600">Carregant factures…</div>
        ) : error ? (
          <div className="text-[12px] text-neutral-700">
            <span className="font-medium">Holded:</span> {error}
            <div className="mt-1 text-[11px] text-neutral-500">
              Nota: si el túnel requereix autenticació, aquest bloc necessita cookies (credentials include).
            </div>
          </div>
        ) : thisMonth.length === 0 ? (
          <div className="text-[12px] text-neutral-700">
            Cap factura importada aquest mes <span className="font-medium">({nowMonth})</span>.
          </div>
        ) : (
          <div>
            <div className="mb-2 text-[12px] font-medium text-neutral-700">Últimes (top 8)</div>
            <div className="space-y-2">
              {top8.map((inv) => (
                <div key={inv.key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-neutral-900">
                      {inv.number ? `Factura ${inv.number}` : "Factura (sense número)"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-600">
                      {inv.dateISO ? inv.dateISO : "Data desconeguda"} · {inv.customerMasked ?? "Client"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] text-neutral-500">Total</div>
                    <div className="text-[12px] font-semibold text-neutral-900">
                      {typeof inv.totalEUR === "number" ? fmtEUR(inv.totalEUR) : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {thisMonth.length > 8 ? (
              <div className="mt-2 text-[11px] text-neutral-500">
                Mostrant 8 de {thisMonth.length}.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}