"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithAuth, fetchWithAuth } from "@/lib/fetch-with-auth";
import { applyBundleBySku } from "./BundleResolver";

import type {
  BundleDef,
  ClientRow,
  DelegateRow,
  LineDraft,
  NewClientForm,
  ProductRow,
} from "./types";

import {
  emptyNewClientForm,
  fetchJson,
  isValidEmail,
  isValidSpanishTaxId,
  normalizeProducts,
  normalizeTaxId,
  safeStr,
  toNum,
} from "./utils";

import StatCard from "./StatCard";
import DelegateSelectorCard from "./DelegateSelectorCard";
import ClientSelectorCard from "./ClientSelectorCard";
import ProductLinesCard from "./ProductLinesCard";

type PaymentMethodOption = {
  id: string;
  name: string;
};

export default function OrdersConsoleTab({ delegateMode: delegateModeProp = false }: { delegateMode?: boolean }) {
  const [delegates, setDelegates] = useState<DelegateRow[]>([]);
  const [delegatesLoad, setDelegatesLoad] = useState<
    "idle" | "loading" | "ok" | "forbidden" | "error"
  >(delegateModeProp ? "forbidden" : "idle");
  const [selectedDelegateId, setSelectedDelegateId] = useState<string>("");

  // Auto-detect delegate mode: either explicitly requested or the API returned 403
  const delegateMode = delegateModeProp || delegatesLoad === "forbidden";

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoad, setClientsLoad] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [clientQuery, setClientQuery] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [bundlesBySku, setBundlesBySku] = useState<Map<string, BundleDef>>(
    new Map(),
  );
  const [productsLoad, setProductsLoad] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [productQuery, setProductQuery] = useState<string>("");

  const [lines, setLines] = useState<LineDraft[]>([
    { sku: "", quantity: 1, unit_price: null },
  ]);

  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "ok" | "error"
  >("idle");
  const [submitMsg, setSubmitMsg] = useState<string>("");

  const [createClientOpen, setCreateClientOpen] = useState<boolean>(false);
  const [createClientState, setCreateClientState] = useState<
    "idle" | "submitting" | "ok" | "error"
  >("idle");
  const [createClientMsg, setCreateClientMsg] = useState<string>("");
  const [newClient, setNewClient] = useState<NewClientForm>(
    emptyNewClientForm(),
  );

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>(
    [],
  );
  const [paymentMethodsLoad, setPaymentMethodsLoad] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");

  useEffect(() => {
    if (delegateModeProp) return;
    let alive = true;

    (async () => {
      setDelegatesLoad("loading");
      const res = await fetchJson("/api/control-room/delegates");
      if (!alive) return;

      if (!res.ok && (res.status === 401 || res.status === 403)) {
        setDelegatesLoad("forbidden");
        setDelegates([]);
        setSelectedDelegateId("");
        return;
      }

      if (!res.ok) {
        setDelegatesLoad("error");
        setDelegates([]);
        setSelectedDelegateId("");
        return;
      }

      const rows = Array.isArray(res.json?.delegates)
        ? res.json.delegates
        : [];
      const normalized: DelegateRow[] = rows
        .map((d: any) => ({
          id: safeStr(d?.id),
          name: d?.name ?? null,
          email: d?.email ?? null,
        }))
        .filter((d: DelegateRow) => !!d.id);

      setDelegates(normalized);
      setDelegatesLoad("ok");
      setSelectedDelegateId((prev) =>
        normalized.some((d) => d.id === prev) ? prev : "",
      );
    })();

    return () => {
      alive = false;
    };
  }, [delegateMode]);

  async function reloadClients(preferredClientId?: string) {
    setClientsLoad("loading");
    const q = selectedDelegateId
      ? `?delegateId=${encodeURIComponent(selectedDelegateId)}`
      : "";

    try {
      const json = await fetchJsonWithAuth<any>(`/api/delegate/clients${q}`, {
        method: "GET",
        cache: "no-store",
      });

      const rows =
        (Array.isArray(json?.clients) ? json.clients : null) ??
        (Array.isArray(json?.items) ? json.items : []);

      const normalized: ClientRow[] = rows
        .map((c: any) => ({
          id: safeStr(c?.id),
          name: c?.name ?? null,
          tax_id: c?.tax_id ?? null,
          delegate_id: c?.delegate_id ?? null,
          holded_contact_id: c?.holded_contact_id ?? null,
          delegate_name: c?.delegate_name ?? null,
          delegate_email: c?.delegate_email ?? null,
          delegate_valid_from: c?.delegate_valid_from ?? null,
          delegate_source: c?.delegate_source ?? null,
        }))
        .filter((c: ClientRow) => !!c.id);

      setClients(normalized);
      setClientsLoad("ok");
      setSelectedClientId((prev) => {
        if (
          preferredClientId &&
          normalized.some((c) => c.id === preferredClientId)
        ) {
          return preferredClientId;
        }
        return normalized.some((c) => c.id === prev) ? prev : "";
      });
    } catch {
      setClientsLoad("error");
      setClients([]);
      setSelectedClientId("");
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      const q = selectedDelegateId
        ? `?delegateId=${encodeURIComponent(selectedDelegateId)}`
        : "";
      setClientsLoad("loading");

      try {
        const json = await fetchJsonWithAuth<any>(`/api/delegate/clients${q}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!alive) return;

        const rows =
          (Array.isArray(json?.clients) ? json.clients : null) ??
          (Array.isArray(json?.items) ? json.items : []);

        const normalized: ClientRow[] = rows
          .map((c: any) => ({
            id: safeStr(c?.id),
            name: c?.name ?? null,
            tax_id: c?.tax_id ?? null,
            delegate_id: c?.delegate_id ?? null,
            holded_contact_id: c?.holded_contact_id ?? null,
            delegate_name: c?.delegate_name ?? null,
            delegate_email: c?.delegate_email ?? null,
            delegate_valid_from: c?.delegate_valid_from ?? null,
            delegate_source: c?.delegate_source ?? null,
          }))
          .filter((c: ClientRow) => !!c.id);

        setClients(normalized);
        setClientsLoad("ok");
        setSelectedClientId((prev) =>
          normalized.some((c) => c.id === prev) ? prev : "",
        );
      } catch {
        if (!alive) return;
        setClientsLoad("error");
        setClients([]);
        setSelectedClientId("");
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedDelegateId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setProductsLoad("loading");
      const q = selectedDelegateId
        ? `?delegateId=${encodeURIComponent(selectedDelegateId)}`
        : "";
      const res = await fetchJson(`/api/delegate/products${q}`);
      if (!alive) return;

      if (!res.ok) {
        setProductsLoad("error");
        setProducts([]);
        setBundlesBySku(new Map());
        return;
      }

      const { products: normalizedProducts, bundles } = normalizeProducts(
        res.json,
      );

      const map = new Map<string, BundleDef>();
      for (const b of bundles) {
        map.set(b.sku, b);
      }

      const withName = normalizedProducts.map((p) => ({
        ...p,
        name: safeStr(p.name).trim() ? p.name : p.sku,
      }));

      withName.sort((a, b) =>
        safeStr(a.name).localeCompare(safeStr(b.name), "es"),
      );

      setProducts(withName);
      setBundlesBySku(map);
      setProductsLoad("ok");
    })();

    return () => {
      alive = false;
    };
  }, [selectedDelegateId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setPaymentMethodsLoad("loading");

      const res = await fetchJson("/api/holded/payment-methods");
      if (!alive) return;

      if (!res.ok) {
        setPaymentMethodsLoad("error");
        setPaymentMethods([]);
        return;
      }

      const rows = Array.isArray(res.json?.data) ? res.json.data : [];

      const normalized: PaymentMethodOption[] = rows
        .map((row: any) => ({
          id: safeStr(row?.id),
          name: safeStr(row?.name),
        }))
        .filter((row: PaymentMethodOption) => !!row.id && !!row.name);

      setPaymentMethods(normalized);
      setPaymentMethodsLoad("ok");
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((c) => {
      const n = safeStr(c.name).toLowerCase();
      const t = safeStr(c.tax_id).toLowerCase();
      return n.includes(q) || t.includes(q);
    });
  }, [clients, clientQuery]);

  const productOptions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const base = products;

    const hits = !q
      ? base
      : base.filter((p) => {
          const sku = safeStr(p.sku).toLowerCase();
          const name = safeStr(p.name).toLowerCase();
          const desc = safeStr(p.description).toLowerCase();
          return sku.includes(q) || name.includes(q) || desc.includes(q);
        });

    return hits.slice(0, 120);
  }, [products, productQuery]);

  const selectedDelegate = useMemo(
    () => delegates.find((d) => d.id === selectedDelegateId) ?? null,
    [delegates, selectedDelegateId],
  );

  const cardsClientsValue =
    !delegateMode && !selectedDelegateId && clients.length === 0
      ? "—"
      : clientsLoad === "loading"
        ? "…"
        : clients.length;

  const cardsDelegateValue = delegateMode
    ? "Tú"
    : selectedDelegate
      ? safeStr(selectedDelegate.name || selectedDelegate.email || "—")
      : "General";

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { sku: "", quantity: 1, unit_price: null },
    ]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function applyProductToLine(lineIndex: number, chosenSku: string) {
    const sku = safeStr(chosenSku).trim();

    if (!sku) {
      setLine(lineIndex, { sku: "", quantity: 1, unit_price: null });
      return;
    }

    const bundleLines = applyBundleBySku(bundlesBySku, sku);

    if (bundleLines && bundleLines.length > 0) {
      setLines(
        bundleLines.length
          ? bundleLines
          : [{ sku, quantity: 1, unit_price: null }],
      );
      return;
    }

    setLine(lineIndex, { sku, quantity: 1 });
  }

  function setNewClientField<K extends keyof NewClientForm>(
    key: K,
    value: NewClientForm[K],
  ) {
    setNewClient((prev) => ({ ...prev, [key]: value }));
  }

  function resetNewClientForm() {
    setNewClient(emptyNewClientForm());
    setCreateClientState("idle");
    setCreateClientMsg("");
  }

  function handleToggleCreateClient() {
    if (createClientOpen) {
      setCreateClientOpen(false);
      resetNewClientForm();
      return;
    }

    setCreateClientOpen(true);
    setCreateClientState("idle");
    setCreateClientMsg("");
  }

  function handleCancelCreateClient() {
    setCreateClientOpen(false);
    resetNewClientForm();
  }

  async function emitMissingIbanWarning(params: {
    clientId: string;
    holdedContactId?: string | null;
    paymentMethodName: string;
  }) {
    try {
      await fetch("/api/control-room/warnings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          code: "CLIENT_GIRO_MISSING_IBAN",
          severity: "warning",
          title: "Cliente con giro sin IBAN",
          message:
            "Se ha dado de alta un cliente con forma de pago Giro sin IBAN informado. Requiere revisión operativa.",
          client_id: params.clientId,
          delegate_id: selectedDelegateId,
          holded_contact_id: params.holdedContactId ?? null,
          recipients: [
            "el-elyon",
            "delegate",
            "commercial-coordinator",
            "administrative",
          ],
          context: {
            payment_method_name: params.paymentMethodName,
            missing_iban: true,
            source: "orders-console-client-create",
          },
        }),
      });
    } catch {
      // No bloquea el alta
    }
  }

  async function submitCreateClient() {
    setCreateClientState("submitting");
    setCreateClientMsg("");

    if (!delegateMode && !selectedDelegateId) {
      setCreateClientState("error");
      setCreateClientMsg(
        "Debes seleccionar un delegado antes de crear el cliente.",
      );
      return;
    }

    const payload = {
      ...(delegateMode ? {} : { delegate_id: selectedDelegateId }),
      name: safeStr(newClient.name).trim(),
      tax_id: normalizeTaxId(newClient.tax_id),
      phone: safeStr(newClient.phone).trim(),
      email: safeStr(newClient.email).trim(),
      shipping_address: safeStr(newClient.shipping_address).trim(),
      shipping_postal_code: safeStr(newClient.shipping_postal_code).trim(),
      shipping_city: safeStr(newClient.shipping_city).trim(),
      shipping_province: safeStr(newClient.shipping_province).trim(),
      shipping_country: safeStr(newClient.shipping_country).trim(),
      equivalence_surcharge: newClient.equivalence_surcharge,
      payment_method_id: safeStr(newClient.payment_method_id).trim(),
      iban: safeStr(newClient.iban).trim(),
      notes: safeStr(newClient.notes).trim(),
      vat_percent: 10,
    };

    if (!payload.name) {
      setCreateClientState("error");
      setCreateClientMsg("El nombre es obligatorio.");
      return;
    }

    if (!payload.tax_id) {
      setCreateClientState("error");
      setCreateClientMsg("El NIF/CIF es obligatorio.");
      return;
    }

    if (!isValidSpanishTaxId(payload.tax_id)) {
      setCreateClientState("error");
      setCreateClientMsg("El NIF/CIF no es válido.");
      return;
    }

    if (!payload.phone) {
      setCreateClientState("error");
      setCreateClientMsg("El teléfono es obligatorio.");
      return;
    }

    if (!payload.shipping_address) {
      setCreateClientState("error");
      setCreateClientMsg("El domicilio es obligatorio.");
      return;
    }

    if (!payload.shipping_postal_code) {
      setCreateClientState("error");
      setCreateClientMsg("El código postal es obligatorio.");
      return;
    }

    if (!payload.email) {
      setCreateClientState("error");
      setCreateClientMsg("El email es obligatorio.");
      return;
    }

    if (!isValidEmail(payload.email)) {
      setCreateClientState("error");
      setCreateClientMsg("El email no tiene un formato válido.");
      return;
    }

    if (payload.equivalence_surcharge === "") {
      setCreateClientState("error");
      setCreateClientMsg(
        "Debes indicar si el cliente tiene recargo de equivalencia.",
      );
      return;
    }

    if (!payload.payment_method_id) {
      setCreateClientState("error");
      setCreateClientMsg("La forma de pago es obligatoria.");
      return;
    }

    const selectedPaymentMethod =
      paymentMethods.find((m) => m.id === payload.payment_method_id) ?? null;

    const paymentMethodName = safeStr(selectedPaymentMethod?.name || "");
    const isGiro = paymentMethodName.toLowerCase().includes("giro");
    const missingIbanForGiro = isGiro && !payload.iban;

    try {
      const r = await fetchWithAuth("/api/delegate/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setCreateClientState("error");
        setCreateClientMsg(
          safeStr(j?.error || j?.message || `Error ${r.status}`),
        );
        return;
      }

      const createdClientId = safeStr(j?.client?.id || "");
      const holdedContactId = safeStr(j?.client?.holded_contact_id || "");

      await reloadClients(createdClientId || undefined);

      if (createdClientId) {
        setSelectedClientId(createdClientId);
      }

      if (missingIbanForGiro && createdClientId) {
        await emitMissingIbanWarning({
          clientId: createdClientId,
          holdedContactId: holdedContactId || null,
          paymentMethodName,
        });
      }

      setCreateClientState("ok");
      setCreateClientMsg(
        missingIbanForGiro
          ? "Cliente creado correctamente. Se ha emitido warning por Giro sin IBAN."
          : "Cliente creado correctamente.",
      );
      setCreateClientOpen(false);
      setNewClient(emptyNewClientForm());
    } catch (e: any) {
      setCreateClientState("error");
      setCreateClientMsg(e?.message ?? "Error inesperado");
    }
  }

  async function submitCreateDraft() {
    setSubmitState("submitting");
    setSubmitMsg("");

    const client_id = selectedClientId || null;
    const cleanLines = lines
      .map((l) => ({
        sku: safeStr(l.sku).trim(),
        quantity: Math.max(1, Math.floor(toNum(l.quantity, 1))),
        unit_price:
          l.unit_price == null || l.unit_price === ("" as any)
            ? null
            : toNum(l.unit_price, 0),
      }))
      .filter((l) => l.sku);

    if (!client_id) {
      setSubmitState("error");
      setSubmitMsg("Selecciona un cliente.");
      return;
    }

    if (!cleanLines.length) {
      setSubmitState("error");
      setSubmitMsg("Añade al menos 1 línea.");
      return;
    }

    const body: any = {
      client_id,
      delegate_id: selectedDelegateId ? selectedDelegateId : null,
      items: cleanLines,
    };

    try {
      const r = await fetch("/api/control-room/holded/orders/create-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setSubmitState("error");
        setSubmitMsg(
          safeStr(j?.error || j?.message || `Error ${r.status}`),
        );
        return;
      }

      setSubmitState("ok");
      setSubmitMsg("OK — pedido borrador enviado a Producción.");
    } catch (e: any) {
      setSubmitState("error");
      setSubmitMsg(e?.message ?? "Error inesperado");
    }
  }

  return (
    <div style={{ maxWidth: 1160 }}>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "baseline",
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800 }}>Pedidos</div>
        <div style={{ fontSize: 14, color: "#666" }}>
          Crear pedido borrador en Holded · Selecciona cliente y producto ·
          Packs se auto-rellenan desde BD
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: 18,
        }}
      >
        {!delegateMode && (
          <StatCard
            title="Delegado"
            value={cardsDelegateValue}
            subtitle={
              selectedDelegateId
                ? "Ámbito filtrado por delegado"
                : "Vista general sin delegado seleccionado"
            }
          />
        )}

        <StatCard
          title="Clientes"
          value={cardsClientsValue}
          subtitle={
            delegateMode
              ? "Clientes de tu cartera"
              : !selectedDelegateId
                ? "Selecciona delegado para cargar clientes"
                : "Clientes operativos del delegado"
          }
        />

        <StatCard
          title="Productos"
          value={productsLoad === "loading" ? "…" : products.length}
          subtitle="Catálogo disponible para pedidos"
        />

        <StatCard
          title="Líneas"
          value={lines.length}
          subtitle="Líneas actuales del borrador"
        />
      </div>

      {!delegateMode && (
        <DelegateSelectorCard
          delegates={delegates}
          delegatesLoad={delegatesLoad}
          selectedDelegateId={selectedDelegateId}
          selectedDelegate={selectedDelegate}
          onChange={setSelectedDelegateId}
        />
      )}

      <ClientSelectorCard
        clients={clients}
        filteredClients={filteredClients}
        clientsLoad={clientsLoad}
        selectedDelegateId={selectedDelegateId}
        delegateMode={delegateMode}
        clientQuery={clientQuery}
        selectedClientId={selectedClientId}
        createClientOpen={createClientOpen}
        createClientState={createClientState}
        createClientMsg={createClientMsg}
        newClient={newClient}
        paymentMethods={paymentMethods}
        paymentMethodsLoad={paymentMethodsLoad}
        onClientQueryChange={setClientQuery}
        onSelectedClientChange={setSelectedClientId}
        onToggleCreateClient={handleToggleCreateClient}
        onNewClientChange={setNewClientField}
        onSubmitCreateClient={submitCreateClient}
        onCancelCreateClient={handleCancelCreateClient}
      />

      <ProductLinesCard
        products={products}
        productOptions={productOptions}
        productsLoad={productsLoad}
        productQuery={productQuery}
        lines={lines}
        onProductQueryChange={setProductQuery}
        onApplyProductToLine={applyProductToLine}
        onSetLineQuantity={(lineIndex, value) =>
          setLine(lineIndex, { quantity: toNum(value, 1) })
        }
        onSetLineUnitPrice={(lineIndex, value) =>
          setLine(lineIndex, {
            unit_price: value === "" ? null : toNum(value, 0),
          })
        }
        onRemoveLine={removeLine}
        onAddLine={addLine}
      />

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={submitCreateDraft}
          disabled={submitState === "submitting"}
          style={{
            height: 42,
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            padding: "0 16px",
            cursor: submitState === "submitting" ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          {submitState === "submitting"
            ? "Enviando…"
            : "Crear borrador en Holded"}
        </button>

        {submitMsg ? (
          <div
            style={{
              fontSize: 13,
              color: submitState === "error" ? "#b00020" : "#166534",
            }}
          >
            {submitMsg}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        Nota: el tooltip del selector usa <code>description</code>. Los packs
        ya la tienen desde BD. El spray la conectaremos a Holded en el siguiente
        paso.
      </div>
    </div>
  );
}