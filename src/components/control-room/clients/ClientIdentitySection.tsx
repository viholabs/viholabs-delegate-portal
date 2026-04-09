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
  canEditStatus: boolean;
};

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "INACTIVE", label: "INACTIVE" },
  { value: "PENDING_VALIDATION", label: "PENDING_VALIDATION" },
  { value: "PENDING_REVIEW", label: "PENDING_REVIEW" },
  { value: "VALID", label: "VALID" },
  { value: "INVALID", label: "INVALID" },
  { value: "ARCHIVED", label: "ARCHIVED" },
];

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
    color: "#6B7280",
    letterSpacing: 0.2,
    textTransform: "uppercase" as const,
  };
}

function selectStyle(disabled: boolean) {
  return {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid #D6D3D1",
    background: disabled ? "rgba(0,0,0,0.03)" : "#FFFFFF",
    color: "#1F2937",
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
  } as const;
}

function helpStyle() {
  return {
    fontSize: 12,
    lineHeight: 1.45,
    color: "#6B7280",
  } as const;
}

export default function ClientIdentitySection({
  selected,
  updateSelected,
  canEditStatus,
}: Props) {
  const statusDisabled = !canEditStatus;

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

        <div style={fieldWrapStyle()}>
          <label style={labelStyle()}>Status</label>
          <select
            value={selected.status ?? ""}
            disabled={statusDisabled}
            onChange={(event) =>
              updateSelected(
                "status",
                (event.target.value || null) as ClientDetailViewModel["status"]
              )
            }
            style={selectStyle(statusDisabled)}
          >
            <option value="">Sin status</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div style={helpStyle()}>
            {canEditStatus
              ? "Puedes modificar el status de este cliente."
              : "Tu perfil puede ver el status, pero no editarlo."}
          </div>
        </div>

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