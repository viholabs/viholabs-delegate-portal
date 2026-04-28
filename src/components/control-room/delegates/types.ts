// src/components/control-room/delegates/types.ts
// Tipos canónicos compartidos entre list y detail del módulo Delegates.

// ---------------------------------------------------------------------------
// List types (compartidos con DelegatesModule / DelegatesList)
// ---------------------------------------------------------------------------

export type DelegatePeriod = {
  month: string;
  emitted_count: number;
  emitted_total_net: number;
  emitted_total_gross: number;
  liquidable_count: number;
  liquidable_total_net: number;
  liquidable_total_gross: number;
  pending_count: number;
  pending_total_gross: number;
  overdue_count: number;
  overdue_total_gross: number;
  // Comisión estimada para el listado (calculada desde unidades reales de invoice_items)
  commission_provisional: number;
  applied_tier_pct: number | null;
  units_approx: number;           // unidades de venta cobradas en el periodo (desde items reales)
  next_tier_pct: number | null;   // % del siguiente tramo (null = ya en tier máximo)
  next_tier_threshold: number | null; // unidades mínimas del siguiente tramo
};

export type DelegateListRow = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  clients_total: number;    // todos los clientes asignados
  clients_active: number;   // con compra en los últimos 30 días
  clients_dormant: number;  // sin compra en los últimos 30 días
  period: DelegatePeriod;
};

// ---------------------------------------------------------------------------
// Detail types
// ---------------------------------------------------------------------------

export type DelegateDetailActor = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  role: string | null;
  commission_level: number | null;
  company: string | null;
  job_title: string | null;
  department: string | null;
  created_at: string;
};

export type PaymentStatus = "PAID" | "PENDING" | "OVERDUE" | "CREDIT_NOTE" | "CANCELLED";

export type DetailInvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  paid_date: string | null;
  client_id: string | null;
  client_name: string | null;
  document_type: "invoice" | "creditnote";
  units_sold: number;
  units_foc: number;
  net_commissionable: number;
  total_net: number;
  total_vat: number;
  total_gross: number;
  payment_status: PaymentStatus;
  days_overdue: number | null;
  /** true si paid_date cae dentro del periodo visualizado — estas unidades cuentan para comisión */
  paid_in_period: boolean;
};

export type DetailClientRow = {
  id: string;
  name: string | null;
  last_invoice_date: string | null;
  last_invoice_gross: number;
  units_period: number;
  days_since_activity: number | null;
  assigned_since: string | null;
};

export type CommissionRule = {
  id: string;
  delegate_id: string | null;
  year: number;
  channel: string;
  from_units: number;
  to_units: number;
  percentage: number;
  reference_price: number;
  valid_from: string | null;
  valid_to: string | null;
  active: boolean;
};

export type SettlementProposal = {
  id: string;
  period_yyyy_mm: string;
  status: string;
  total_units_sold_paid: number;
  total_units_foc: number;
  total_net_commissionable: number;
  total_commission_amount: number;
  total_adjustments_amount: number;
  total_payable_amount: number;
  data_cutoff_at: string | null;
  ruleset_version: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditEntry = {
  id: string;
  ts: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  row_pk: string;
  reason_code: string | null;
  reason_text: string | null;
  source: string | null;
};

export type DetailPeriodStats = {
  month: string;
  // Facturación del periodo (por fecha de emisión)
  billing_emitted_count: number;
  billing_emitted_gross: number;
  // Cobrado (por fecha de pago, puede incluir facturas de meses anteriores)
  billing_paid_count: number;
  billing_paid_gross: number;
  // Pendiente no vencido
  billing_pending_count: number;
  billing_pending_gross: number;
  // Vencido sin cobrar
  billing_overdue_count: number;
  billing_overdue_gross: number;
  // Unidades
  units_sold_period: number;       // unidades en facturas emitidas en el periodo
  units_foc_period: number;        // unidades promo/FOC en facturas del periodo
  units_liquidable: number;        // unidades de facturas cobradas (base comisionable)
  units_pending_non_overdue: number;
  units_pending_overdue: number;
  // Acumulados para seguimiento de bono
  units_liquidable_quarter: number; // cobradas desde inicio del trimestre (YTD Q)
  units_liquidable_year: number;    // cobradas desde enero (YTD año)
  // Comisiones
  net_commissionable: number;      // units_liquidable × reference_price
  commission_provisional: number;  // calculado según tier aplicado
  commission_liquidable: number;   // = commission_provisional (sobre lo cobrado)
  applied_tier_percentage: number | null;
};

export type DelegateDetailResponse = {
  ok: true;
  viewer: {
    actorId: string;
    isMelquisedec: boolean;
    canEdit: boolean;
  };
  delegate: DelegateDetailActor;
  period: DetailPeriodStats;
  invoices: DetailInvoiceRow[];
  clients: {
    active: DetailClientRow[];
    inactive: DetailClientRow[];
  };
  commission_rules: CommissionRule[];
  settlement: {
    current: SettlementProposal | null;
    history: SettlementProposal[];
  };
  audit: AuditEntry[];
};

export type DelegateDetailApiError = {
  ok: false;
  stage?: string;
  error: string;
};

export type DelegateDetailApiResult = DelegateDetailResponse | DelegateDetailApiError;
