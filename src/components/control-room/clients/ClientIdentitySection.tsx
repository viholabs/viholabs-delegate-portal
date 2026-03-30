"use client";

import type { ClientDetailViewModel } from "./types";
import { DetailValue, TextInput } from "./ClientField";
import SectionCard from "./SectionCard";

type Props = {
  selected: ClientDetailViewModel;
  updateSelected: <K extends keyof ClientDetailViewModel>(
    key: K,
    value: ClientDetailViewModel[K]
  ) => void;
};

export default function ClientIdentitySection({
  selected,
  updateSelected,
}: Props) {
  return (
    <SectionCard title="Identidad" subtitle="Datos maestros del cliente.">
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <TextInput
          label="Nombre"
          value={selected.name}
          onChange={(value) => updateSelected("name", value)}
        />
        <TextInput
          label="Nombre legal"
          value={selected.legal_name}
          onChange={(value) => updateSelected("legal_name", value)}
        />
        <TextInput
          label="Tax ID"
          value={selected.tax_id}
          onChange={(value) => updateSelected("tax_id", value)}
        />
        <TextInput
          label="VAT Number"
          value={selected.vat_number}
          onChange={(value) => updateSelected("vat_number", value)}
        />
        <TextInput
          label="Profile type"
          value={selected.profile_type}
          onChange={(value) => updateSelected("profile_type", value)}
        />
        <TextInput
          label="Status"
          value={selected.status}
          onChange={(value) => updateSelected("status", value)}
        />
        <TextInput
          label="State code"
          value={selected.state_code}
          onChange={(value) => updateSelected("state_code", value)}
        />
        <DetailValue
          label="Holded contact ID"
          value={selected.holded_contact_id}
        />
      </div>
    </SectionCard>
  );
}