"use client";

import type { ClientDetailViewModel } from "./types";
import { TextInput } from "./ClientField";
import SectionCard from "./SectionCard";

type Props = {
  selected: ClientDetailViewModel;
  updateSelected: <K extends keyof ClientDetailViewModel>(
    key: K,
    value: ClientDetailViewModel[K]
  ) => void;
};

export default function ClientContactSection({
  selected,
  updateSelected,
}: Props) {
  return (
    <SectionCard
      title="Contacto"
      subtitle="Datos de comunicación y facturación."
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <TextInput
          label="Email contacto"
          value={selected.contact_email}
          onChange={(value) => updateSelected("contact_email", value)}
        />
        <TextInput
          label="Email facturación"
          value={selected.billing_email}
          onChange={(value) => updateSelected("billing_email", value)}
        />
        <TextInput
          label="Teléfono"
          value={selected.contact_phone}
          onChange={(value) => updateSelected("contact_phone", value)}
        />
        <TextInput
          label="Móvil"
          value={selected.mobile_phone}
          onChange={(value) => updateSelected("mobile_phone", value)}
        />
        <TextInput
          label="Website"
          value={selected.website}
          onChange={(value) => updateSelected("website", value)}
        />
      </div>
    </SectionCard>
  );
}