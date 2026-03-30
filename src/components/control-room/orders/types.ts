// src/components/control-room/orders/types.ts

export type DelegateRow = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type ClientRow = {
  id: string;
  name?: string | null;
  tax_id?: string | null;
  delegate_id?: string | null;
  holded_contact_id?: string | null;
  delegate_name?: string | null;
  delegate_email?: string | null;
  delegate_valid_from?: string | null;
  delegate_source?: string | null;
};

export type ProductRow = {
  id?: string | null;
  sku: string;
  name?: string | null;
  description?: string | null;
  is_bundle?: boolean;
};

export type BundleItem = {
  sku: string;
  quantity: number;
  unit_price_override: number | null;
};

export type BundleDef = {
  sku: string;
  title: string | null;
  description: string | null;
  items: BundleItem[];
};

export type LineDraft = {
  sku: string;
  quantity: number;
  unit_price: number | null;
};

export type NewClientForm = {
  name: string;
  tax_id: string;
  phone: string;
  email: string;
  shipping_address: string;
  shipping_postal_code: string;
  shipping_city: string;
  shipping_province: string;
  shipping_country: string;
  equivalence_surcharge: boolean | "";
  payment_method_id: string;
  payment_term_label: string;
  iban: string;
  notes: string;
};