"use client";

import type {
  ClientDetailViewModel,
  PaymentMethodOption,
  PaymentTermOption,
} from "./types";
import { DetailValue, TextInput } from "./ClientField";
import SectionCard from "./SectionCard";
import { BORDER, MUTED, SURFACE, TEXT } from "./ui";
import { formatDate } from "./utils";

type Props = {
  selected: ClientDetailViewModel;
  updateSelected: <K extends keyof ClientDetailViewModel>(
    key: K,
    value: ClientDetailViewModel[K]
  ) => void;
  paymentMethods: PaymentMethodOption[];
  paymentTerms: PaymentTermOption[];
  paymentMethodsLoading: boolean;
  paymentTermsLoading: boolean;
  paymentMethodsError: string | null;
  paymentTermsError: string | null;
};

function fieldWrapStyle() {
  return {
    display: "grid",
    gap: 6,
  } as const;
}

function labelStyle() {
  return {
    fontSize: 12,
    fontWeight: 700,
    color: MUTED,
    letterSpacing: 0.2,
    textTransform: "uppercase" as const,
  };
}

function selectStyle(disabled: boolean) {
  return {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    background: disabled ? "rgba(0,0,0,0.03)" : SURFACE,
    color: TEXT,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
  } as const;
}

function helpStyle() {
  return {
    fontSize: 12,
    lineHeight: 1.45,
    color: MUTED,
  } as const;
}

export default function ClientSepaSection({
  selected,
  updateSelected,
  paymentMethods,
  paymentTerms,
  paymentMethodsLoading,
  paymentTermsLoading,
  paymentMethodsError,
  paymentTermsError,
}: Props) {
  const methodDisabled = paymentMethodsLoading || paymentMethods.length === 0;
  const termsDisabled = paymentTermsLoading || paymentTerms.length === 0;

  return (
    <SectionCard
      title="Cobro / SEPA"
      subtitle="Datos bancarios y estado del mandato."
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <div style={fieldWrapStyle()}>
          <label style={labelStyle()}>Método de pago</label>
          <select
            value={selected.payment_method_name ?? ""}
            disabled={methodDisabled}
            onChange={(event) =>
              updateSelected(
                "payment_method_name",
                (event.target.value || null) as ClientDetailViewModel["payment_method_name"]
              )
            }
            style={selectStyle(methodDisabled)}
          >
            <option value="">Sin método de pago</option>
            {selected.payment_method_name &&
            !paymentMethods.some(
              (item) => item.name === selected.payment_method_name
            ) ? (
              <option value={selected.payment_method_name}>
                {selected.payment_method_name}
              </option>
            ) : null}
            {paymentMethods.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <div style={helpStyle()}>
            {paymentMethodsError
              ? `No se pudieron cargar los métodos de pago: ${paymentMethodsError}`
              : paymentMethodsLoading
              ? "Cargando métodos de pago de Holded…"
              : "Selecciona uno de los métodos existentes en Holded."}
          </div>
        </div>

        <div style={fieldWrapStyle()}>
          <label style={labelStyle()}>Términos de pago</label>
          <select
            value={selected.payment_terms_name ?? ""}
            disabled={termsDisabled}
            onChange={(event) =>
              updateSelected(
                "payment_terms_name",
                (event.target.value || null) as ClientDetailViewModel["payment_terms_name"]
              )
            }
            style={selectStyle(termsDisabled)}
          >
            <option value="">Sin términos de pago</option>
            {selected.payment_terms_name &&
            !paymentTerms.some(
              (item) => item.name === selected.payment_terms_name
            ) ? (
              <option value={selected.payment_terms_name}>
                {selected.payment_terms_name}
              </option>
            ) : null}
            {paymentTerms.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <div style={helpStyle()}>
            {paymentTermsError
              ? `No se pudieron cargar los términos de pago: ${paymentTermsError}`
              : paymentTermsLoading
              ? "Cargando vencimientos desde Holded…"
              : "Selecciona uno de los vencimientos disponibles."}
          </div>
        </div>

        <TextInput
          label="IBAN"
          value={selected.iban}
          onChange={(value) => updateSelected("iban", value)}
          placeholder="ES..."
        />
        <TextInput
          label="Titular de cuenta"
          value={selected.bank_account_holder}
          onChange={(value) => updateSelected("bank_account_holder", value)}
        />
        <DetailValue label="SEPA status" value={selected.sepa_status} />
        <DetailValue label="SEPA reference" value={selected.sepa_reference} />
        <DetailValue
          label="SEPA generated at"
          value={formatDate(selected.sepa_generated_at)}
        />
        <DetailValue
          label="SEPA signed at"
          value={formatDate(selected.sepa_signed_at)}
        />
        <DetailValue
          label="SEPA document path"
          value={selected.sepa_document_path}
        />
        <DetailValue label="Created at" value={formatDate(selected.created_at)} />
      </div>
    </SectionCard>
  );
}