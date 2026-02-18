/**
 * VIHOLABS — HOLDed Paid-State Canonical Engine
 *
 * Canonical rule (conservative / audit-safe):
 *
 * PAID =
 *   payments_pending === 0
 *   AND payments_total >= total_gross
 *   AND draft !== true
 *
 * If any critical field missing → return null (never guess)
 */

export type PaidStateInput = {
  total_gross: number | null;
  payments_total: number | null;
  payments_pending: number | null;
  payments_refunds?: number | null;
  draft?: boolean | null;
};

export type PaidStateResult = {
  is_paid: boolean | null;
  reason: string;
};

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function computeCanonicalPaidState(input: PaidStateInput): PaidStateResult {
  const {
    total_gross,
    payments_total,
    payments_pending,
    payments_refunds,
    draft,
  } = input;

  if (draft === true) {
    return { is_paid: false, reason: "draft_document" };
  }

  if (!isFiniteNumber(total_gross)) {
    return { is_paid: null, reason: "missing_total_gross" };
  }

  if (!isFiniteNumber(payments_total)) {
    return { is_paid: null, reason: "missing_payments_total" };
  }

  if (!isFiniteNumber(payments_pending)) {
    return { is_paid: null, reason: "missing_payments_pending" };
  }

  if (payments_pending !== 0) {
    return { is_paid: false, reason: "payments_pending_nonzero" };
  }

  if (payments_total < total_gross) {
    return { is_paid: false, reason: "payments_total_less_than_total" };
  }

  if (isFiniteNumber(payments_refunds) && payments_refunds > 0) {
    return { is_paid: false, reason: "refund_detected_requires_review" };
  }

  return { is_paid: true, reason: "canonical_paid_rule_satisfied" };
}
