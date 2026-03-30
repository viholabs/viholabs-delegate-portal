"use client";

import type { ClientDetailViewModel } from "./types";
import { DetailValue, TextInput } from "./ClientField";
import SectionCard from "./SectionCard";
import { formatDate } from "./utils";

type Props = {
  selected: ClientDetailViewModel;
  updateSelected: <K extends keyof ClientDetailViewModel>(
    key: K,
    value: ClientDetailViewModel[K]
  ) => void;
};

export default function ClientSepaSection({
  selected,
  updateSelected,
}: Props) {
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
        <TextInput
          label="Método de pago"
          value={selected.payment_method_name}
          onChange={(value) => updateSelected("payment_method_name", value)}
        />
        <TextInput
          label="Términos de pago"
          value={selected.payment_terms_name}
          onChange={(value) => updateSelected("payment_terms_name", value)}
        />
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