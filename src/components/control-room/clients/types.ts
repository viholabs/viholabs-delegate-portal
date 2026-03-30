export type Nullable<T> = T | null;

export type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

export type ActorOption = {
  id: string;
  name: string | null;
  email: string | null;
};

export type RecommenderOption = {
  id: string;
  name: string | null;
  email: string | null;
};

export type AffiliateOption = {
  id: string;
  name: string | null;
  label: string | null;
};

export type ClientListItem = {
  id: string;
  name: string | null;
  legal_name: string | null;
  tax_id: string | null;
  vat_number: string | null;

  email: string | null;
  phone: string | null;

  contact_email: string | null;
  billing_email: string | null;
  contact_phone: string | null;

  city: string | null;
  country: string | null;

  payment_method_name: string | null;
  payment_terms_name: string | null;

  sepa_status: string | null;

  status: string | null;
  state_code: string | null;
  profile_type: string | null;

  holded_contact_id: string | null;

  delegate_id: string | null;
  delegate_name: string | null;

  recommended_by_client_id: string | null;
  recommended_by_client_name: string | null;

  affiliate_account_id: string | null;
  affiliate_name: string | null;

  created_at: string | null;
  updated_at: string | null;
};

export type ClientInvoice = {
  id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  client_id: string | null;
  client_name: string | null;
  total_net: number | null;
  total_gross: number | null;
  total_tax: number | null;
  currency: string | null;
  state_code: string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  source_provider: string | null;
};

export type ClientInvoiceItem = {
  id?: string | null;
  line_type?: string | null;
  kind?: string | null;
  sku?: string | null;
  description?: string | null;
  name?: string | null;
  quantity?: number | null;
  units?: number | null;
  unit_price?: number | null;
  discount?: number | null;
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  total?: number | null;
};

export type InvoiceDetail = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  client_id: string | null;
  client_name: string | null;
  total_net: number | null;
  total_gross: number | null;
  total_tax: number | null;
  currency: string | null;
  state_code: string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  source_provider: string | null;

  holded_status_label?: string | null;
  payment_method_label?: string | null;
  payment_method_name?: string | null;
  payment_terms_name?: string | null;
};

export type InvoiceDetailResponse = {
  ok: boolean;
  invoice: InvoiceDetail | null;
  items: ClientInvoiceItem[];
  error?: string;
};

export type ClientDetailViewModel = {
  id: string | null;

  name: string | null;
  legal_name: string | null;
  tax_id: string | null;
  vat_number: string | null;

  contact_email: string | null;
  billing_email: string | null;
  contact_phone: string | null;
  mobile_phone: string | null;
  website: string | null;

  fiscal_address_line1: string | null;
  fiscal_address_line2: string | null;
  fiscal_city: string | null;
  fiscal_region: string | null;
  fiscal_postal_code: string | null;
  fiscal_country: string | null;

  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_region: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;

  payment_method_name: string | null;
  payment_terms_name: string | null;
  iban: string | null;
  bank_account_holder: string | null;

  holded_contact_id: string | null;

  delegate_id: string | null;
  delegate_name: string | null;

  recommended_by_client_id: string | null;
  recommended_by_client_name: string | null;

  affiliate_account_id: string | null;
  affiliate_name: string | null;

  sepa_status: string | null;
  sepa_reference: string | null;
  sepa_generated_at: string | null;
  sepa_signed_at: string | null;
  sepa_document_path: string | null;

  profile_type: string | null;
  status: string | null;
  state_code: string | null;

  created_at: string | null;
  updated_at: string | null;

  invoices: ClientInvoice[];

  meta?: {
    master_data_source: "holded" | "clients" | "mixed";
    holded_enriched: boolean;
  };
};

export type ListResponse = {
  ok: boolean;
  items: ClientListItem[];
  error?: string;
};

export type DetailResponse = {
  ok: boolean;
  data: ClientDetailViewModel | null;
  error?: string;
};

export type ActorAssignmentsDictionaries = {
  delegates: ActorOption[];
  recommenders: RecommenderOption[];
  affiliates: AffiliateOption[];
};

export type ActorAssignmentsViewer = {
  actor_id?: string | null;
  role_code?: string | null;
  can_edit_delegate?: boolean | null;
  can_edit_recommender?: boolean | null;
  can_edit_affiliate?: boolean | null;
  can_manage_client_assignments?: boolean | null;
  canManageClientAssignments?: boolean | null;
  is_admin?: boolean | null;
};

export type ActorAssignmentsResponse = {
  ok: boolean;
  dictionaries: ActorAssignmentsDictionaries;
  viewer: ActorAssignmentsViewer;
  error?: string;
};