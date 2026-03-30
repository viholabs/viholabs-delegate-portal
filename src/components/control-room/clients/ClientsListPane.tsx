"use client";

import type { ClientListItem } from "./types";
import { BORDER, ERROR_BG, ERROR_TX, GOLD, MUTED, SOFT, SURFACE, TEXT } from "./ui";
import { buildDisplayName, compact } from "./utils";

type ClientsListPaneProps = {
  clients: ClientListItem[];
  clientsLoading: boolean;
  clientsError: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelectClient: (id: string) => void;
};

export default function ClientsListPane({
  clients,
  clientsLoading,
  clientsError,
  search,
  onSearchChange,
  selectedId,
  onSelectClient,
}: ClientsListPaneProps) {
  return (
    <aside
      style={{
        minWidth: 0,
        border: `1px solid ${BORDER}`,
        background: SURFACE,
        borderRadius: 24,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: 18,
          borderBottom: `1px solid ${BORDER}`,
          display: "grid",
          gap: 12,
          background: SOFT,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h2
            style={{
              margin: 0,
              color: TEXT,
              fontSize: 20,
              lineHeight: 1.2,
            }}
          >
            Clients
          </h2>
          <p
            style={{
              margin: 0,
              color: MUTED,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            Lista operativa de clientes del portal.
          </p>
        </div>

        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre, NIF, email, estado..."
          style={{
            width: "100%",
            minWidth: 0,
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            color: TEXT,
            borderRadius: 14,
            padding: "12px 14px",
            outline: "none",
            fontSize: 14,
          }}
        />

        <div
          style={{
            fontSize: 12,
            color: MUTED,
            fontWeight: 600,
          }}
        >
          {clientsLoading
            ? "Cargando clientes..."
            : `${clients.length} visibles`}
        </div>
      </div>

      <div
        style={{
          maxHeight: "72vh",
          overflowY: "auto",
        }}
      >
        {clientsLoading ? (
          <div style={{ display: "grid", gap: 10, padding: 16 }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 16,
                  padding: 14,
                  background: SURFACE,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    height: 14,
                    width: "68%",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.06)",
                  }}
                />
                <div
                  style={{
                    height: 12,
                    width: "48%",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.05)",
                  }}
                />
                <div
                  style={{
                    height: 12,
                    width: "56%",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.05)",
                  }}
                />
              </div>
            ))}
          </div>
        ) : clientsError ? (
          <div style={{ padding: 16 }}>
            <div
              style={{
                border: `1px solid ${ERROR_TX}`,
                background: ERROR_BG,
                color: ERROR_TX,
                borderRadius: 14,
                padding: 14,
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              {clientsError}
            </div>
          </div>
        ) : clients.length === 0 ? (
          <div
            style={{
              padding: 20,
              color: MUTED,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            No hay clientes que coincidan con la búsqueda.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, padding: 12 }}>
            {clients.map((client) => {
              const isActive = client.id === selectedId;

              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onSelectClient(client.id)}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    border: `1px solid ${isActive ? GOLD : BORDER}`,
                    background: isActive ? SOFT : SURFACE,
                    borderRadius: 18,
                    padding: 14,
                    cursor: "pointer",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      color: TEXT,
                      fontWeight: 700,
                      fontSize: 15,
                      lineHeight: 1.3,
                    }}
                  >
                    {buildDisplayName(client)}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      fontSize: 12,
                      color: MUTED,
                    }}
                  >
                    <span>{compact(client.tax_id || client.vat_number)}</span>
                    <span>•</span>
                    <span>{compact(client.contact_email)}</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      fontSize: 12,
                      color: MUTED,
                    }}
                  >
                    <span>Estado: {compact(client.status || client.state_code)}</span>
                    <span>•</span>
                    <span>SEPA: {compact(client.sepa_status)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}