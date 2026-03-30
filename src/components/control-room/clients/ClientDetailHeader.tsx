"use client";

import type { ClientDetailViewModel } from "./types";
import { ACCENT, BORDER, MUTED, SURFACE, TEXT } from "./ui";
import { compact, formatDate } from "./utils";

type ClientDetailHeaderProps = {
  selected: ClientDetailViewModel;
  saveLoading: boolean;
  sepaLoading: boolean;
  onSave: () => void;
  onGenerateSepa: () => void;
  onClose: () => void;
};

export default function ClientDetailHeader({
  selected,
  saveLoading,
  sepaLoading,
  onSave,
  onGenerateSepa,
  onClose,
}: ClientDetailHeaderProps) {
  return (
    <section
      style={{
        border: `1px solid ${BORDER}`,
        background: SURFACE,
        borderRadius: 24,
        padding: 20,
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              color: MUTED,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Ficha de cliente
          </div>
          <h1
            style={{
              margin: 0,
              color: TEXT,
              fontSize: 28,
              lineHeight: 1.15,
            }}
          >
            {compact(selected.name || selected.legal_name)}
          </h1>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              color: MUTED,
              fontSize: 13,
            }}
          >
            <span>ID: {selected.id}</span>
            <span>•</span>
            <span>Holded: {compact(selected.holded_contact_id)}</span>
            <span>•</span>
            <span>Actualizado: {formatDate(selected.updated_at)}</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onSave}
            disabled={saveLoading || sepaLoading}
            style={{
              border: `1px solid ${ACCENT}`,
              background: ACCENT,
              color: "#fff",
              borderRadius: 12,
              padding: "12px 16px",
              fontWeight: 700,
              cursor: saveLoading || sepaLoading ? "not-allowed" : "pointer",
            }}
          >
            {saveLoading ? "Guardando..." : "Guardar cambios"}
          </button>

          <button
            type="button"
            onClick={onGenerateSepa}
            disabled={saveLoading || sepaLoading}
            style={{
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              color: TEXT,
              borderRadius: 12,
              padding: "12px 16px",
              fontWeight: 700,
              cursor: saveLoading || sepaLoading ? "not-allowed" : "pointer",
            }}
          >
            {sepaLoading ? "Generando..." : "Generar SEPA"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={saveLoading || sepaLoading}
            style={{
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              color: MUTED,
              borderRadius: 12,
              padding: "12px 16px",
              fontWeight: 700,
              cursor: saveLoading || sepaLoading ? "not-allowed" : "pointer",
            }}
          >
            Cerrar ficha
          </button>
        </div>
      </div>
    </section>
  );
}