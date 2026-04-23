"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClientRow, NewClientForm } from "./types";
import { safeStr } from "./utils";
import ClientCreateForm from "./ClientCreateForm";

type PaymentMethodOption = {
  id: string;
  name: string;
};

type Props = {
  clients: ClientRow[];
  filteredClients: ClientRow[];
  clientsLoad: "idle" | "loading" | "ok" | "error";
  selectedDelegateId: string;
  delegateMode?: boolean;
  clientQuery: string;
  selectedClientId: string;
  createClientOpen: boolean;
  createClientState: "idle" | "submitting" | "ok" | "error";
  createClientMsg: string;
  newClient: NewClientForm;
  paymentMethods: PaymentMethodOption[];
  paymentMethodsLoad: "idle" | "loading" | "ok" | "error";
  onClientQueryChange: (value: string) => void;
  onSelectedClientChange: (value: string) => void;
  onToggleCreateClient: () => void;
  onNewClientChange: <K extends keyof NewClientForm>(
    key: K,
    value: NewClientForm[K]
  ) => void;
  onSubmitCreateClient: () => void;
  onCancelCreateClient: () => void;
};

export default function ClientSelectorCard({
  clients,
  filteredClients,
  clientsLoad,
  selectedDelegateId,
  delegateMode = false,
  clientQuery,
  selectedClientId,
  createClientOpen,
  createClientState,
  createClientMsg,
  newClient,
  paymentMethods,
  paymentMethodsLoad,
  onClientQueryChange,
  onSelectedClientChange,
  onToggleCreateClient,
  onNewClientChange,
  onSubmitCreateClient,
  onCancelCreateClient,
}: Props) {
  const needsDelegate = !delegateMode && !selectedDelegateId;
  return (
    <Card
      style={{
        marginBottom: 14,
        borderColor: "#e7d8bc",
        boxShadow: "0 1px 2px rgba(90,46,58,0.04)",
      }}
    >
      <CardHeader style={{ paddingBottom: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "baseline",
          }}
        >
          <CardTitle style={{ fontSize: 16, color: "#5a2e3a" }}>
            Cliente
          </CardTitle>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={onToggleCreateClient}
              disabled={needsDelegate}
              style={{
                height: 34,
                borderRadius: 10,
                border: "1px solid #ddd",
                background: needsDelegate ? "#f8f8f8" : "#fff",
                padding: "0 12px",
                cursor: needsDelegate ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {createClientOpen ? "Cerrar alta" : "Crear cliente"}
            </button>

            <div style={{ fontSize: 12, color: "#7f6d61" }}>
              {clientsLoad === "loading"
                ? "cargando…"
                : clientsLoad === "ok"
                ? `${clients.length} clientes`
                : clientsLoad === "error"
                ? "error"
                : "—"}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent style={{ paddingTop: 0 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={clientQuery}
            onChange={(e) => onClientQueryChange(e.target.value)}
            placeholder="Buscar cliente (nombre o NIF)…"
            style={{
              flex: "1 1 280px",
              height: 38,
              borderRadius: 10,
              border: "1px solid #ddd",
              padding: "0 10px",
              background: needsDelegate ? "#f8f8f8" : "#fff",
            }}
            disabled={needsDelegate}
          />

          <select
            value={selectedClientId}
            onChange={(e) => onSelectedClientChange(e.target.value)}
            style={{
              flex: "2 1 420px",
              height: 38,
              borderRadius: 10,
              border: "1px solid #ddd",
              padding: "0 10px",
              background: needsDelegate ? "#f8f8f8" : "#fff",
            }}
            disabled={needsDelegate}
          >
            <option value="">
              {needsDelegate
                ? "— Elige primero un delegado —"
                : "— Selecciona un cliente —"}
            </option>

            {filteredClients.slice(0, 200).map((c) => (
              <option key={c.id} value={c.id}>
                {safeStr(c.name || "—")} {c.tax_id ? `· ${c.tax_id}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#6b5c53",
            lineHeight: 1.45,
          }}
        >
          {needsDelegate
            ? "Como Melquisedec o rol supervisor, primero debes elegir un delegado. Hasta entonces no se listan clientes."
            : clientsLoad === "loading"
            ? "Cargando clientes…"
            : "Listado operativo de tus clientes."}
        </div>

        {createClientOpen ? (
          <ClientCreateForm
            newClient={newClient}
            createClientState={createClientState}
            createClientMsg={createClientMsg}
            selectedDelegateId={selectedDelegateId}
            delegateMode={delegateMode}
            paymentMethods={paymentMethods}
            paymentMethodsLoad={paymentMethodsLoad}
            onChange={onNewClientChange}
            onSubmit={onSubmitCreateClient}
            onCancel={onCancelCreateClient}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}