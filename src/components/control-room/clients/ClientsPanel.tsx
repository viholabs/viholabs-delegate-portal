// src/components/control-room/clients/ClientsPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import ClientCommercialSection from "./ClientCommercialSection";
import ClientContactSection from "./ClientContactSection";
import ClientDetailHeader from "./ClientDetailHeader";
import ClientFiscalSection from "./ClientFiscalSection";
import ClientIdentitySection from "./ClientIdentitySection";
import ClientInvoicesSection from "./ClientInvoicesSection";
import ClientsListPane from "./ClientsListPane";
import ClientSepaSection from "./ClientSepaSection";

import type {
  ActorAssignmentsResponse,
  ClientDetailViewModel,
  ClientListItem,
  DetailResponse,
  ListResponse,
  ToastState,
} from "./types";

import {
  BORDER,
  ERROR_BG,
  ERROR_TX,
  MUTED,
  SUCCESS_BG,
  SUCCESS_TX,
  SURFACE,
  TEXT,
} from "./ui";

import { isValidEmail, isValidIban, normalizeIban } from "./utils";

export default function ClientsPanel() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [selected, setSelected] = useState<ClientDetailViewModel | null>(null);
  const [originalSelected, setOriginalSelected] =
    useState<ClientDetailViewModel | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [saveLoading, setSaveLoading] = useState(false);
  const [sepaLoading, setSepaLoading] = useState(false);

  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [assignmentsCatalogs, setAssignmentsCatalogs] =
    useState<ActorAssignmentsResponse["dictionaries"] | null>(null);
  const [assignmentsViewer, setAssignmentsViewer] =
    useState<ActorAssignmentsResponse["viewer"] | null>(null);

  const [toast, setToast] = useState<ToastState>(null);

  async function loadClients() {
    try {
      setClientsLoading(true);
      setClientsError(null);

      const res = await fetch("/api/delegate/clients", {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as ListResponse;

      if (!res.ok || !Array.isArray(json.items)) {
        throw new Error(json.error || "No se pudieron cargar los clientes");
      }

      setClients(json.items);
    } catch (error: unknown) {
      setClientsError(
        error instanceof Error ? error.message : "Error cargando clientes"
      );
    } finally {
      setClientsLoading(false);
    }
  }

  async function loadAssignmentsCatalogs() {
    try {
      setAssignmentsLoading(true);
      setAssignmentsError(null);

      const res = await fetch("/api/control-room/el-elyon/client-assignments", {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as ActorAssignmentsResponse;

      if (!res.ok || !json.ok || !json.dictionaries || !json.viewer) {
        throw new Error(
          json.error || "No se pudieron cargar los catálogos de actores"
        );
      }

      setAssignmentsCatalogs(json.dictionaries);
      setAssignmentsViewer(json.viewer);
    } catch (error: unknown) {
      setAssignmentsError(
        error instanceof Error
          ? error.message
          : "Error cargando catálogos de actores"
      );
    } finally {
      setAssignmentsLoading(false);
    }
  }

  async function openClient(id: string) {
    try {
      setSelectedId(id);
      setDetailLoading(true);
      setDetailError(null);
      setToast(null);

      const res = await fetch(`/api/control-room/clients/${id}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as DetailResponse;

      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error || "No se pudo abrir la ficha del cliente");
      }

      setSelected(json.data);
      setOriginalSelected(json.data);
    } catch (error: unknown) {
      setSelected(null);
      setOriginalSelected(null);
      setDetailError(
        error instanceof Error
          ? error.message
          : "Error cargando el detalle del cliente"
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function updateSelected<K extends keyof ClientDetailViewModel>(
    key: K,
    value: ClientDetailViewModel[K]
  ) {
    setSelected((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function saveBasicFields() {
    if (!selected?.id) return;

    const payload = {
      name: selected.name,
      legal_name: selected.legal_name,
      tax_id: selected.tax_id,
      vat_number: selected.vat_number,
      contact_email: selected.contact_email,
      billing_email: selected.billing_email,
      contact_phone: selected.contact_phone,
      fiscal_address_line1: selected.fiscal_address_line1,
      fiscal_address_line2: selected.fiscal_address_line2,
      fiscal_city: selected.fiscal_city,
      fiscal_region: selected.fiscal_region,
      fiscal_postal_code: selected.fiscal_postal_code,
      fiscal_country: selected.fiscal_country,
      payment_method_name: selected.payment_method_name,
      payment_terms_name: selected.payment_terms_name,
      iban: normalizeIban(selected.iban),
      bank_account_holder: selected.bank_account_holder,
    };

    const res = await fetch(`/api/control-room/clients/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as DetailResponse;

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "No se pudieron guardar los cambios");
    }
  }

  async function saveDelegateIfChanged() {
    if (!selected || !originalSelected || !selected.holded_contact_id) return;

    const before = String(originalSelected.delegate_id ?? "").trim() || null;
    const after = String(selected.delegate_id ?? "").trim() || null;

    if (before === after) return;

    const res = await fetch(
      "/api/control-room/el-elyon/client-assignments/upsert",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientHoldedContactId: selected.holded_contact_id,
          assignmentRole: "delegate",
          actorId: after,
        }),
      }
    );

    const json = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "No se pudo guardar el delegado");
    }
  }

  async function saveRecommenderIfChanged() {
    if (!selected || !originalSelected || !selected.holded_contact_id) return;

    const before =
      String(originalSelected.recommended_by_client_id ?? "").trim() || null;
    const after =
      String(selected.recommended_by_client_id ?? "").trim() || null;

    if (before === after) return;

    const res = await fetch(
      "/api/control-room/el-elyon/client-assignments/upsert",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientHoldedContactId: selected.holded_contact_id,
          assignmentRole: "recommender",
          recommenderClientId: after,
        }),
      }
    );

    const json = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "No se pudo guardar el recomendador");
    }
  }

  async function saveAffiliateIfChanged() {
    if (!selected || !originalSelected || !selected.id) return;

    const before =
      String(originalSelected.affiliate_account_id ?? "").trim() || null;
    const after = String(selected.affiliate_account_id ?? "").trim() || null;

    if (before === after) return;

    const res = await fetch(
      "/api/control-room/el-elyon/client-assignments/upsert-affiliate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selected.id,
          affiliateAccountId: after,
        }),
      }
    );

    const json = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "No se pudo guardar el afiliado");
    }
  }

  async function save() {
    if (!selected?.id) return;

    if (!isValidEmail(selected.contact_email)) {
      setToast({
        type: "error",
        message: "El email de contacto no es válido.",
      });
      return;
    }

    if (!isValidEmail(selected.billing_email)) {
      setToast({
        type: "error",
        message: "El email de facturación no es válido.",
      });
      return;
    }

    if (!isValidIban(selected.iban)) {
      setToast({
        type: "error",
        message: "El IBAN no tiene un formato válido.",
      });
      return;
    }

    try {
      setSaveLoading(true);
      setToast(null);

      await saveBasicFields();

      if (assignmentsViewer?.canManageClientAssignments) {
        await saveDelegateIfChanged();
        await saveRecommenderIfChanged();
        await saveAffiliateIfChanged();
      }

      setToast({
        type: "success",
        message: "Cliente actualizado correctamente.",
      });

      await Promise.all([
        loadClients(),
        loadAssignmentsCatalogs(),
        openClient(selected.id),
      ]);
    } catch (error: unknown) {
      setToast({
        type: "error",
        message:
          error instanceof Error ? error.message : "Error guardando cambios",
      });
    } finally {
      setSaveLoading(false);
    }
  }

  async function generateSepa() {
    if (!selected?.id) return;

    try {
      setSepaLoading(true);
      setToast(null);

      const res = await fetch("/api/sepa/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_id: selected.id }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        if (contentType.includes("application/json")) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error || "No se pudo generar el SEPA");
        }

        const text = await res.text();
        throw new Error(text || "No se pudo generar el SEPA");
      }

      const blob = await res.blob();
      const fileNameMatch = res.headers
        .get("content-disposition")
        ?.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] || `SEPA_${selected.id}.pdf`;

      const url = URL.createObjectURL(blob);

      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      }

      setToast({
        type: "success",
        message: "SEPA generado y descargado correctamente.",
      });

      await openClient(selected.id);
    } catch (error: unknown) {
      setToast({
        type: "error",
        message:
          error instanceof Error ? error.message : "Error generando el SEPA",
      });
    } finally {
      setSepaLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setOriginalSelected(null);
    setSelectedId(null);
    setDetailError(null);
    setToast(null);
  }

  useEffect(() => {
    void Promise.all([loadClients(), loadAssignmentsCatalogs()]);
  }, []);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return clients;

    return clients.filter((client) => {
      const haystack = [
        client.name,
        client.legal_name,
        client.tax_id,
        client.vat_number,
        client.contact_email,
        client.billing_email,
        client.status,
        client.state_code,
        client.payment_method_name,
        client.payment_terms_name,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }, [clients, search]);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)",
        alignItems: "start",
      }}
    >
      <ClientsListPane
        clients={filteredClients}
        clientsLoading={clientsLoading}
        clientsError={clientsError}
        search={search}
        onSearchChange={setSearch}
        selectedId={selectedId}
        onSelectClient={openClient}
      />

      <main style={{ minWidth: 0, display: "grid", gap: 16 }}>
        {toast ? (
          <div
            style={{
              border: `1px solid ${
                toast.type === "success" ? SUCCESS_TX : ERROR_TX
              }`,
              background: toast.type === "success" ? SUCCESS_BG : ERROR_BG,
              color: toast.type === "success" ? SUCCESS_TX : ERROR_TX,
              borderRadius: 14,
              padding: 14,
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {toast.message}
          </div>
        ) : null}

        {!selectedId ? (
          <section
            style={{
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              borderRadius: 24,
              padding: 28,
              minHeight: 320,
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{
                maxWidth: 560,
                textAlign: "center",
                display: "grid",
                gap: 10,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  color: TEXT,
                  fontSize: 22,
                  lineHeight: 1.2,
                }}
              >
                Selecciona un cliente
              </h2>
              <p
                style={{
                  margin: 0,
                  color: MUTED,
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                Aquí verás la ficha completa, las acciones de guardado, la
                edición comercial y la generación del mandato SEPA.
              </p>
            </div>
          </section>
        ) : detailLoading ? (
          <section
            style={{
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              borderRadius: 24,
              padding: 20,
              display: "grid",
              gap: 14,
            }}
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                style={{
                  height: 72,
                  borderRadius: 18,
                  background: "rgba(0,0,0,0.05)",
                }}
              />
            ))}
          </section>
        ) : detailError ? (
          <section
            style={{
              border: `1px solid ${ERROR_TX}`,
              background: ERROR_BG,
              color: ERROR_TX,
              borderRadius: 24,
              padding: 20,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {detailError}
          </section>
        ) : selected ? (
          <div style={{ display: "grid", gap: 16 }}>
            <ClientDetailHeader
              selected={selected}
              saveLoading={saveLoading}
              sepaLoading={sepaLoading}
              onSave={save}
              onGenerateSepa={generateSepa}
              onClose={closeDetail}
            />

            <ClientIdentitySection
              selected={selected}
              updateSelected={updateSelected}
            />

            <ClientContactSection
              selected={selected}
              updateSelected={updateSelected}
            />

            <ClientFiscalSection
              selected={selected}
              updateSelected={updateSelected}
            />

            <ClientCommercialSection
              selected={selected}
              updateSelected={updateSelected}
              delegates={assignmentsCatalogs?.delegates ?? []}
              recommenders={assignmentsCatalogs?.recommenders ?? []}
              affiliates={assignmentsCatalogs?.affiliates ?? []}
              canEditActors={Boolean(
                assignmentsViewer?.canManageClientAssignments
              )}
              assignmentsLoading={assignmentsLoading}
              assignmentsError={assignmentsError}
            />

            <ClientSepaSection
              selected={selected}
              updateSelected={updateSelected}
            />

            <ClientInvoicesSection selected={selected} />
          </div>
        ) : null}
      </main>
    </div>
  );
}