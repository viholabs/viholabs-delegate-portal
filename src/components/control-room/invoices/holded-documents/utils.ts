import type { ActorFilterOption, HoldedInvoiceRow } from "./types";

export function safeText(value: string | null | undefined, fallback = "—") {
  if (!value || value.trim() === "") return fallback;
  return value;
}

export function monthOptions(count = 18): string[] {
  const now = new Date();
  const list: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    list.push(`${yyyy}-${mm}`);
  }

  return list;
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function sortRows(rows: HoldedInvoiceRow[]) {
  return [...rows].sort((a, b) => {
    const da = a.invoice_date ?? "";
    const db = b.invoice_date ?? "";
    if (da !== db) return db.localeCompare(da);

    const na = a.invoice_number ?? "";
    const nb = b.invoice_number ?? "";
    return nb.localeCompare(na);
  });
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function money(value: unknown, currency = "EUR") {
  const amount = toNumber(value);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} €`;
  }
}

export function fmtDate(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "—";

  const ymdMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const [, yyyy, mm, dd] = ymdMatch;
    return `${dd}-${mm}-${yyyy}`;
  }

  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})[T\s].*$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd}-${mm}-${yyyy}`;
  }

  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  }

  return v;
}

export function resolveInvoiceTotal(row: HoldedInvoiceRow) {
  if (row.total_gross != null) return toNumber(row.total_gross);
  if (row.total_net != null) return toNumber(row.total_net);
  return 0;
}

export function lineName(item: Record<string, any>) {
  return safeText(
    typeof item?.name === "string"
      ? item.name
      : typeof item?.description === "string"
        ? item.description
        : null
  );
}

export function lineSku(item: Record<string, any>) {
  return safeText(
    typeof item?.sku === "string"
      ? item.sku
      : typeof item?.product_sku === "string"
        ? item.product_sku
        : typeof item?.reference === "string"
          ? item.reference
          : null
  );
}

export function unitsSale(item: Record<string, any>) {
  const kind = String(item?.kind ?? "").toUpperCase();
  if (kind === "SALE") return toNumber(item?.units);
  return 0;
}

export function unitsPromo(item: Record<string, any>) {
  const kind = String(item?.kind ?? "").toUpperCase();
  if (kind === "PROMO") return toNumber(item?.units);
  return 0;
}

export function affiliateLabel(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "—";
  return `Afiliado ${v.slice(0, 8)}`;
}

export function rowMatchesActor(row: HoldedInvoiceRow, selectedActorKey: string) {
  if (selectedActorKey === "all") return true;

  const [kind, id] = selectedActorKey.split("::");
  const target = String(id ?? "").trim();

  if (!target) return true;

  if (kind === "delegate") {
    return String(row.delegate_id ?? "").trim() === target;
  }

  if (kind === "recommender") {
    return String(row.recommender_id ?? "").trim() === target;
  }

  if (kind === "affiliate") {
    return String(row.affiliate_account_id ?? "").trim() === target;
  }

  return true;
}

export function buildActorOptions(rows: HoldedInvoiceRow[]): ActorFilterOption[] {
  const map = new Map<string, ActorFilterOption>();

  for (const row of rows) {
    const delegateId = String(row.delegate_id ?? "").trim();
    if (delegateId) {
      map.set(`delegate::${delegateId}`, {
        key: `delegate::${delegateId}`,
        label: `Delegado · ${safeText(row.delegate_name, delegateId)}`,
      });
    }

    const recommenderId = String(row.recommender_id ?? "").trim();
    if (recommenderId) {
      map.set(`recommender::${recommenderId}`, {
        key: `recommender::${recommenderId}`,
        label: `Recomendador · ${safeText(row.recommender_name, recommenderId)}`,
      });
    }

    const affiliateId = String(row.affiliate_account_id ?? "").trim();
    if (affiliateId) {
      map.set(`affiliate::${affiliateId}`, {
        key: `affiliate::${affiliateId}`,
        label: affiliateLabel(affiliateId),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}