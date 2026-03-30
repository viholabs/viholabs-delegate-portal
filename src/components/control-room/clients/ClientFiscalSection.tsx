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

export default function ClientFiscalSection({
  selected,
  updateSelected,
}: Props) {
  return (
    <SectionCard
      title="Dirección fiscal"
      subtitle="Dirección administrativa del cliente."
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <TextInput
          label="Línea 1"
          value={selected.fiscal_address_line1}
          onChange={(value) => updateSelected("fiscal_address_line1", value)}
        />
        <TextInput
          label="Línea 2"
          value={selected.fiscal_address_line2}
          onChange={(value) => updateSelected("fiscal_address_line2", value)}
        />
        <TextInput
          label="Ciudad"
          value={selected.fiscal_city}
          onChange={(value) => updateSelected("fiscal_city", value)}
        />
        <TextInput
          label="Región"
          value={selected.fiscal_region}
          onChange={(value) => updateSelected("fiscal_region", value)}
        />
        <TextInput
          label="Código postal"
          value={selected.fiscal_postal_code}
          onChange={(value) => updateSelected("fiscal_postal_code", value)}
        />
        <TextInput
          label="País"
          value={selected.fiscal_country}
          onChange={(value) => updateSelected("fiscal_country", value)}
        />
      </div>
    </SectionCard>
  );
}