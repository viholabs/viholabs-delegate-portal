"use client";

import type { NewClientForm } from "./types";

type PaymentMethodOption = {
  id: string;
  name: string;
};

type Props = {
  newClient: NewClientForm;
  createClientState: "idle" | "submitting" | "ok" | "error";
  createClientMsg: string;
  selectedDelegateId: string;
  delegateMode?: boolean;
  paymentMethods: PaymentMethodOption[];
  paymentMethodsLoad: "idle" | "loading" | "ok" | "error";
  onChange: <K extends keyof NewClientForm>(key: K, value: NewClientForm[K]) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export default function ClientCreateForm({
  newClient,
  createClientState,
  createClientMsg,
  selectedDelegateId,
  delegateMode = false,
  paymentMethods,
  paymentMethodsLoad,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const canSubmit = delegateMode || !!selectedDelegateId;
  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: "1px solid #eee2cf",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#5a2e3a",
        }}
      >
        Alta de cliente
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <input
          value={newClient.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Nombre *"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.tax_id}
          onChange={(e) => onChange("tax_id", e.target.value)}
          placeholder="NIF/CIF *"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder="Teléfono *"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="Email *"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.shipping_address}
          onChange={(e) => onChange("shipping_address", e.target.value)}
          placeholder="Domicilio *"
          style={{
            gridColumn: "1 / -1",
            height: 38,
            borderRadius: 10,
            border: "1px solid #ddd",
            padding: "0 10px",
          }}
        />

        <input
          value={newClient.shipping_postal_code}
          onChange={(e) => onChange("shipping_postal_code", e.target.value)}
          placeholder="Código postal *"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.shipping_city}
          onChange={(e) => onChange("shipping_city", e.target.value)}
          placeholder="Ciudad"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.shipping_province}
          onChange={(e) => onChange("shipping_province", e.target.value)}
          placeholder="Provincia"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.shipping_country}
          onChange={(e) => onChange("shipping_country", e.target.value)}
          placeholder="País"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <input
          value={newClient.iban}
          onChange={(e) => onChange("iban", e.target.value)}
          placeholder="IBAN"
          style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
        />

        <select
          value={newClient.payment_method_id}
          onChange={(e) => onChange("payment_method_id", e.target.value)}
          disabled={paymentMethodsLoad === "loading" || paymentMethodsLoad === "error"}
          style={{
            height: 38,
            borderRadius: 10,
            border: "1px solid #ddd",
            padding: "0 10px",
            background:
              paymentMethodsLoad === "loading" || paymentMethodsLoad === "error"
                ? "#f8f8f8"
                : "#fff",
          }}
        >
          <option value="">
            {paymentMethodsLoad === "loading"
              ? "Cargando formas de pago…"
              : paymentMethodsLoad === "error"
                ? "Error cargando formas de pago"
                : "Forma de pago *"}
          </option>

          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </select>

        <select
          value={
            newClient.equivalence_surcharge === ""
              ? ""
              : newClient.equivalence_surcharge
                ? "true"
                : "false"
          }
          onChange={(e) =>
            onChange(
              "equivalence_surcharge",
              e.target.value === "" ? "" : e.target.value === "true",
            )
          }
          style={{
            height: 38,
            borderRadius: 10,
            border: "1px solid #ddd",
            padding: "0 10px",
            background: "#fff",
          }}
        >
          <option value="">Recargo de equivalencia *</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>

        <textarea
          value={newClient.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="Observaciones"
          rows={4}
          style={{
            gridColumn: "1 / -1",
            borderRadius: 10,
            border: "1px solid #ddd",
            padding: "10px 12px",
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ fontSize: 12, color: "#6b5c53", lineHeight: 1.45 }}>
        El cliente quedará asignado al delegado seleccionado. IVA por defecto: 10%.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={createClientState === "submitting" || !canSubmit}
          style={{
            height: 40,
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            padding: "0 14px",
            cursor: createClientState === "submitting" || !canSubmit ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          {createClientState === "submitting" ? "Guardando…" : "Guardar cliente"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          style={{
            height: 40,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            padding: "0 14px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Cancelar
        </button>

        {createClientMsg ? (
          <div style={{ fontSize: 13, color: createClientState === "error" ? "#b00020" : "#166534" }}>
            {createClientMsg}
          </div>
        ) : null}
      </div>
    </div>
  );
}