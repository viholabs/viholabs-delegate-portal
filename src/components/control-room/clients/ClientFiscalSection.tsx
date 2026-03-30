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
      title="Direcciones"
      subtitle="Dirección fiscal y dirección de envío."
    >
      <div
        style={{
          display: "grid",
          gap: 18,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          <TextInput
            label="Fiscal · Línea 1"
            value={selected.fiscal_address_line1}
            onChange={(value) => updateSelected("fiscal_address_line1", value)}
          />
          <TextInput
            label="Fiscal · Línea 2"
            value={selected.fiscal_address_line2}
            onChange={(value) => updateSelected("fiscal_address_line2", value)}
          />
          <TextInput
            label="Fiscal · Ciudad"
            value={selected.fiscal_city}
            onChange={(value) => updateSelected("fiscal_city", value)}
          />
          <TextInput
            label="Fiscal · Región"
            value={selected.fiscal_region}
            onChange={(value) => updateSelected("fiscal_region", value)}
          />
          <TextInput
            label="Fiscal · Código postal"
            value={selected.fiscal_postal_code}
            onChange={(value) => updateSelected("fiscal_postal_code", value)}
          />
          <TextInput
            label="Fiscal · País"
            value={selected.fiscal_country}
            onChange={(value) => updateSelected("fiscal_country", value)}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          <TextInput
            label="Envío · Línea 1"
            value={selected.shipping_address_line1}
            onChange={(value) =>
              updateSelected("shipping_address_line1", value)
            }
          />
          <TextInput
            label="Envío · Línea 2"
            value={selected.shipping_address_line2}
            onChange={(value) =>
              updateSelected("shipping_address_line2", value)
            }
          />
          <TextInput
            label="Envío · Ciudad"
            value={selected.shipping_city}
            onChange={(value) => updateSelected("shipping_city", value)}
          />
          <TextInput
            label="Envío · Región"
            value={selected.shipping_region}
            onChange={(value) => updateSelected("shipping_region", value)}
          />
          <TextInput
            label="Envío · Código postal"
            value={selected.shipping_postal_code}
            onChange={(value) =>
              updateSelected("shipping_postal_code", value)
            }
          />
          <TextInput
            label="Envío · País"
            value={selected.shipping_country}
            onChange={(value) => updateSelected("shipping_country", value)}
          />
        </div>
      </div>
    </SectionCard>
  );
}