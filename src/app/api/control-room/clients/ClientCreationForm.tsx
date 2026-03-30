"use client";

import { useEffect, useState } from "react";

type PaymentMethod = {
  id: string;
  name: string;
};

export default function ClientCreationForm() {
  const [loading, setLoading] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");

  const [form, setForm] = useState({
    name: "",
    nif: "",
    email: "",
    phone: "",
    address: "",
    postal_code: "",
    city: "",
    province: "",
    country: "España",
    iban: "",
    surcharge_equivalence: "",
  });

  const canSubmit =
    form.name &&
    form.nif &&
    form.email &&
    form.phone &&
    form.address &&
    form.postal_code &&
    form.city &&
    form.province &&
    form.country &&
    form.iban &&
    paymentMethodId &&
    form.surcharge_equivalence !== "";

  useEffect(() => {
    fetch("/api/holded/payment-methods")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setPaymentMethods(data.data);
        }
      });
  }, []);

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setLoading(true);

    try {
      const res = await fetch("/api/clients/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          surcharge_equivalence: form.surcharge_equivalence === "true",
          payment_method_id: paymentMethodId,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        alert(json.error);
        return;
      }

      alert("Cliente creado correctamente");
    } catch (e) {
      alert("Error creando cliente");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-semibold">Alta de cliente</h2>

      <input placeholder="Nombre" onChange={(e) => updateField("name", e.target.value)} />
      <input placeholder="NIF" onChange={(e) => updateField("nif", e.target.value)} />
      <input placeholder="Email" onChange={(e) => updateField("email", e.target.value)} />
      <input placeholder="Teléfono" onChange={(e) => updateField("phone", e.target.value)} />
      <input placeholder="Dirección" onChange={(e) => updateField("address", e.target.value)} />
      <input placeholder="Código Postal" onChange={(e) => updateField("postal_code", e.target.value)} />
      <input placeholder="Ciudad" onChange={(e) => updateField("city", e.target.value)} />
      <input placeholder="Provincia" onChange={(e) => updateField("province", e.target.value)} />

      {/* IBAN */}
      <input placeholder="IBAN" onChange={(e) => updateField("iban", e.target.value)} />

      {/* Recargo */}
      <select
        value={form.surcharge_equivalence}
        onChange={(e) => updateField("surcharge_equivalence", e.target.value)}
      >
        <option value="">Recargo de equivalencia</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>

      {/* Payment method */}
      <select
        value={paymentMethodId}
        onChange={(e) => setPaymentMethodId(e.target.value)}
      >
        <option value="">Forma de pago</option>
        {paymentMethods.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <button
        disabled={!canSubmit || loading}
        onClick={handleSubmit}
      >
        {loading ? "Creando..." : "Crear cliente"}
      </button>
    </div>
  );
}