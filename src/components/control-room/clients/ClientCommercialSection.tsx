// src/components/control-room/clients/ClientCommercialSection.tsx
"use client";

import type {
  AffiliateOption,
  ClientDetailViewModel,
  RecommenderOption,
  ActorOption,
} from "./types";
import { DetailValue } from "./ClientField";
import SectionCard from "./SectionCard";
import { BORDER, MUTED, SURFACE, TEXT } from "./ui";

type Props = {
  selected: ClientDetailViewModel;
  updateSelected: <K extends keyof ClientDetailViewModel>(
    key: K,
    value: ClientDetailViewModel[K]
  ) => void;
  delegates: ActorOption[];
  recommenders: RecommenderOption[];
  affiliates: AffiliateOption[];
  canEditActors: boolean;
  assignmentsLoading: boolean;
  assignmentsError: string | null;
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

export default function ClientCommercialSection({
  selected,
  updateSelected,
  delegates,
  recommenders,
  affiliates,
  canEditActors,
  assignmentsLoading,
  assignmentsError,
}: Props) {
  const disabled = assignmentsLoading || !canEditActors || !selected.holded_contact_id;

  return (
    <SectionCard
      title="Estructura comercial"
      subtitle="Vinculación comercial y operativa."
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <div style={fieldWrapStyle()}>
          <label style={labelStyle()}>Delegado</label>
          <select
            value={selected.delegate_id ?? ""}
            disabled={disabled}
            onChange={(event) =>
              updateSelected(
                "delegate_id",
                (event.target.value || null) as ClientDetailViewModel["delegate_id"]
              )
            }
            style={selectStyle(disabled)}
          >
            <option value="">Sin delegado</option>
            {delegates.map((delegate) => (
              <option key={delegate.id} value={delegate.id}>
                {delegate.name || delegate.email || delegate.id}
              </option>
            ))}
          </select>
          <div style={helpStyle()}>
            {assignmentsLoading
              ? "Cargando catálogo de delegados…"
              : canEditActors
              ? "La persistencia se guarda por la ruta canónica de asignaciones."
              : "Tu perfil puede ver la estructura comercial, pero no editarla."}
          </div>
        </div>

        <div style={fieldWrapStyle()}>
          <label style={labelStyle()}>Recomendador</label>
          <select
            value={selected.recommended_by_client_id ?? ""}
            disabled={disabled}
            onChange={(event) =>
              updateSelected(
                "recommended_by_client_id",
                (event.target.value ||
                  null) as ClientDetailViewModel["recommended_by_client_id"]
              )
            }
            style={selectStyle(disabled)}
          >
            <option value="">Sin recomendador</option>
            {recommenders.map((recommender) => (
              <option key={recommender.id} value={recommender.id}>
                {recommender.name || recommender.id}
              </option>
            ))}
          </select>
          <div style={helpStyle()}>
            Se guarda en la estructura canónica de recomendaciones del cliente.
          </div>
        </div>

        <div style={fieldWrapStyle()}>
          <label style={labelStyle()}>Afiliado</label>
          <select
            value={selected.affiliate_account_id ?? ""}
            disabled={assignmentsLoading || !canEditActors}
            onChange={(event) =>
              updateSelected(
                "affiliate_account_id",
                (event.target.value ||
                  null) as ClientDetailViewModel["affiliate_account_id"]
              )
            }
            style={selectStyle(assignmentsLoading || !canEditActors)}
          >
            <option value="">Sin afiliado</option>
            {affiliates.map((affiliate) => (
              <option key={affiliate.id} value={affiliate.id}>
                {affiliate.label || affiliate.name || affiliate.id}
              </option>
            ))}
          </select>
          <div style={helpStyle()}>
            Solo se muestra si existe soporte real y se guarda por evento canónico.
          </div>
        </div>

        <DetailValue label="Holded Contact ID" value={selected.holded_contact_id} />
        <DetailValue label="Delegate ID actual" value={selected.delegate_id} />
        <DetailValue
          label="Recommended by client ID"
          value={selected.recommended_by_client_id}
        />
        <DetailValue
          label="Affiliate account ID"
          value={selected.affiliate_account_id}
        />
      </div>

      {assignmentsError ? (
        <div
          style={{
            marginTop: 14,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: 12,
            fontSize: 13,
            lineHeight: 1.5,
            color: MUTED,
            background: "rgba(0,0,0,0.02)",
          }}
        >
          No se pudieron cargar bien todos los catálogos de actores:{" "}
          {assignmentsError}
        </div>
      ) : null}
    </SectionCard>
  );
}