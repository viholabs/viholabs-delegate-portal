export type HoldedInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  client_id: string | null;
  client_name?: string | null;
  delegate_id: string | null;
  delegate_name?: string | null;
  recommender_id?: string | null;
  recommender_name?: string | null;
  affiliate_account_id?: string | null;
  source_provider: string | null;
  source_channel?: string | null;
  external_invoice_id?: string | null;
  holded_contact_id?: string | null;
  state_code: string | null;
  holded_status_label?: string | null;
  due_date?: string | null;
  source_month: string | null;
  total_net?: number | string | null;
  total_gross?: number | string | null;
  currency?: string | null;
  is_paid?: boolean | null;
  paid_date?: string | null;
};

export type ApiResponse = {
  ok: boolean;
  month: string;
  count: number;
  rows: HoldedInvoiceRow[];
  error?: string;
};

export type InvoiceDetail = {
  invoice: Record<string, any> | null;
  items: Array<Record<string, any>>;
  units?: {
    sold?: number;
    promo?: number;
    discount?: number;
    neutral?: number;
  } | null;
};

export type InvoiceDetailResponse = {
  ok: boolean;
  stage?: string;
  invoice?: Record<string, any>;
  items?: Array<Record<string, any>>;
  units?: {
    sold?: number;
    promo?: number;
    discount?: number;
    neutral?: number;
  };
  items_error?: string;
  error?: string;
};

export type ActorFilterOption = {
  key: string;
  label: string;
};