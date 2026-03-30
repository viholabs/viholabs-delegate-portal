"use client";

import { useEffect, useMemo, useState } from "react";

import ElElyonClientsPanel from "@/components/control-room/el-elyon/ElElyonClientsPanel";
import ElElyonInvoicesPanel from "@/components/control-room/el-elyon/ElElyonInvoicesPanel";

import type {
  ClientAssignmentsApiResponse,
  ClientItem,
  EditorActorOption,
  EditorAffiliateOption,
  EditorOptionsResponse,
  EligibleActor,
  ElElyonInvoiceRow,
  InvoiceOverrideResponse,
  InvoicesResponse,
  Props,
  RecommenderClientOption,
  SaveBody,
} from "@/components/control-room/el-elyon/types";

import { currentMonth, monthOptions } from "@/components/control-room/el-elyon/utils";

export default function ElElyonAssignmentsWorkspace({
  title = "Gobernanza canónica de asignaciones y facturas",
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewerCanManageClientAssignments, setViewerCanManageClientAssignments] =
    useState(false);
  const [viewerCanManageInvoiceOverrides, setViewerCanManageInvoiceOverrides] =
    useState(false);

  const [clients, setClients] = useState<ClientItem[]>([]);
  const [delegates, setDelegates] = useState<EligibleActor[]>([]);
  const [recommenders, setRecommenders] = useState<RecommenderClientOption[]>([]);
  const [affiliates, setAffiliates] = useState<EditorAffiliateOption[]>([]);
  const [kols, setKols] = useState<EligibleActor[]>([]);
  const [coordinators, setCoordinators] = useState<EligibleActor[]>([]);
  const [commissionists, setCommissionists] = useState<EligibleActor[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [search, setSearch] = useState("");

  const [delegateActorId, setDelegateActorId] = useState<string>("");
  const [recommenderClientId, setRecommenderClientId] = useState<string>("");
  const [affiliateAccountId, setAffiliateAccountId] = useState<string>("");
  const [kolActorId, setKolActorId] = useState<string>("");
  const [coordinatorActorId, setCoordinatorActorId] = useState<string>("");

  const [commissionist1ActorId, setCommissionist1ActorId] = useState<string>("");
  const [commissionist2ActorId, setCommissionist2ActorId] = useState<string>("");
  const [commissionist3ActorId, setCommissionist3ActorId] = useState<string>("");
  const [commissionist4ActorId, setCommissionist4ActorId] = useState<string>("");
  const [commissionist5ActorId, setCommissionist5ActorId] = useState<string>("");

  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [invoiceRows, setInvoiceRows] = useState<ElElyonInvoiceRow[]>([]);
  const [invoiceMonth, setInvoiceMonth] = useState<string>(currentMonth());
  const [invoiceSearch, setInvoiceSearch] = useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  const [editorActors, setEditorActors] = useState<EditorActorOption[]>([]);
  const [editorAffiliates, setEditorAffiliates] = useState<EditorAffiliateOption[]>([]);

  const [invoiceDelegateActorId, setInvoiceDelegateActorId] = useState<string>("");
  const [invoiceRecommenderActorId, setInvoiceRecommenderActorId] = useState<string>("");
  const [invoiceAffiliateAccountId, setInvoiceAffiliateAccountId] = useState<string>("");

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/control-room/el-elyon/client-assignments", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as ClientAssignmentsApiResponse;

      if (!response.ok || !data.ok || !data.dictionaries || !data.clients) {
        setClients([]);
        setDelegates([]);
        setRecommenders([]);
        setAffiliates([]);
        setKols([]);
        setCoordinators([]);
        setCommissionists([]);
        setViewerCanManageClientAssignments(false);
        setViewerCanManageInvoiceOverrides(false);
        setError(data.error ?? "No se ha podido cargar El-Elyon.");
        return;
      }

      const nextClients = Array.isArray(data.clients) ? data.clients : [];
      const nextDelegates = Array.isArray(data.dictionaries.delegates)
        ? data.dictionaries.delegates
        : [];
      const nextRecommenders = Array.isArray(data.dictionaries.recommenders)
        ? data.dictionaries.recommenders
        : [];
      const nextAffiliates = Array.isArray(data.dictionaries.affiliates)
        ? data.dictionaries.affiliates
        : [];
      const nextKols = Array.isArray(data.dictionaries.kols) ? data.dictionaries.kols : [];
      const nextCoordinators = Array.isArray(data.dictionaries.coordinators)
        ? data.dictionaries.coordinators
        : [];
      const nextCommissionists = Array.isArray(data.dictionaries.commissionists)
        ? data.dictionaries.commissionists
        : [];

      setClients(nextClients);
      setDelegates(nextDelegates);
      setRecommenders(nextRecommenders);
      setAffiliates(nextAffiliates);
      setKols(nextKols);
      setCoordinators(nextCoordinators);
      setCommissionists(nextCommissionists);
      setViewerCanManageClientAssignments(
        Boolean(data.viewer?.canManageClientAssignments),
      );
      setViewerCanManageInvoiceOverrides(
        Boolean(data.viewer?.canManageInvoiceOverrides),
      );

      setSelectedClientId((prev) => {
        if (prev && nextClients.some((client) => client.id === prev)) return prev;
        return nextClients[0]?.id ?? "";
      });
    } catch (err) {
      setClients([]);
      setDelegates([]);
      setRecommenders([]);
      setAffiliates([]);
      setKols([]);
      setCoordinators([]);
      setCommissionists([]);
      setViewerCanManageClientAssignments(false);
      setViewerCanManageInvoiceOverrides(false);
      setError(err instanceof Error ? err.message : "Error inesperado cargando datos.");
    } finally {
      setLoading(false);
    }
  }

  async function loadInvoiceEditorOptions() {
    const response = await fetch("/api/control-room/el-elyon/invoices/editor-options", {
      method: "GET",
      cache: "no-store",
    });

    const data = (await response.json()) as EditorOptionsResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? "No se pudieron cargar las opciones del editor.");
    }

    setEditorActors(Array.isArray(data.actors) ? data.actors : []);
    setEditorAffiliates(Array.isArray(data.affiliates) ? data.affiliates : []);
  }

  async function loadInvoiceRows(month: string) {
    const response = await fetch(
      `/api/control-room/el-elyon/invoices?month=${encodeURIComponent(month)}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    const data = (await response.json()) as InvoicesResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? "No se pudieron cargar las facturas de El-Elyon.");
    }

    const rows = Array.isArray(data.rows) ? data.rows : [];
    setInvoiceRows(rows);

    setSelectedInvoiceId((prev) => {
      if (prev && rows.some((row) => row.id === prev)) return prev;
      return rows[0]?.id ?? "";
    });
  }

  async function loadInvoiceGovernance(month: string) {
    try {
      setInvoiceLoading(true);
      setInvoiceError(null);

      await Promise.all([loadInvoiceEditorOptions(), loadInvoiceRows(month)]);
    } catch (err) {
      setInvoiceError(
        err instanceof Error ? err.message : "Error inesperado cargando facturas de El-Elyon.",
      );
    } finally {
      setInvoiceLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    void loadInvoiceGovernance(invoiceMonth);
  }, [invoiceMonth]);

  const filteredClients = useMemo<ClientItem[]>(() => {
    const safeClients = Array.isArray(clients) ? clients : [];
    const normalized = search.trim().toLowerCase();

    if (!normalized) return safeClients;

    return safeClients.filter((client) => {
      const haystack = [
        client.name ?? "",
        client.holdedContactId ?? "",
        client.delegate?.actorName ?? "",
        client.recommender?.clientName ?? "",
        client.affiliate?.affiliateName ?? "",
        client.affiliate?.affiliateEmail ?? "",
        client.affiliate?.affiliateExternalId ?? "",
        client.kol?.actorName ?? "",
        client.coordinator?.actorName ?? "",
        client.commissionist_1?.actorName ?? "",
        client.commissionist_2?.actorName ?? "",
        client.commissionist_3?.actorName ?? "",
        client.commissionist_4?.actorName ?? "",
        client.commissionist_5?.actorName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [clients, search]);

  const selectedClient = useMemo(() => {
    const safeClients = Array.isArray(clients) ? clients : [];
    return safeClients.find((client) => client.id === selectedClientId) ?? null;
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (!selectedClient) {
      setDelegateActorId("");
      setRecommenderClientId("");
      setAffiliateAccountId("");
      setKolActorId("");
      setCoordinatorActorId("");
      setCommissionist1ActorId("");
      setCommissionist2ActorId("");
      setCommissionist3ActorId("");
      setCommissionist4ActorId("");
      setCommissionist5ActorId("");
      return;
    }

    setDelegateActorId(selectedClient.delegate?.actorId ?? "");
    setRecommenderClientId(selectedClient.recommender?.clientId ?? "");
    setAffiliateAccountId(selectedClient.affiliate?.affiliateAccountId ?? "");
    setKolActorId(selectedClient.kol?.actorId ?? "");
    setCoordinatorActorId(selectedClient.coordinator?.actorId ?? "");
    setCommissionist1ActorId(selectedClient.commissionist_1?.actorId ?? "");
    setCommissionist2ActorId(selectedClient.commissionist_2?.actorId ?? "");
    setCommissionist3ActorId(selectedClient.commissionist_3?.actorId ?? "");
    setCommissionist4ActorId(selectedClient.commissionist_4?.actorId ?? "");
    setCommissionist5ActorId(selectedClient.commissionist_5?.actorId ?? "");
  }, [selectedClient]);

  const filteredInvoiceRows = useMemo<ElElyonInvoiceRow[]>(() => {
    const safeRows = Array.isArray(invoiceRows) ? invoiceRows : [];
    const normalized = invoiceSearch.trim().toLowerCase();

    if (!normalized) return safeRows;

    return safeRows.filter((row) => {
      const haystack = [
        row.invoice_number ?? "",
        row.invoice_date ?? "",
        row.client_name ?? "",
        row.delegate_name ?? "",
        row.recommender_name ?? "",
        row.affiliate_name ?? "",
        row.state_code ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [invoiceRows, invoiceSearch]);

  const selectedInvoice = useMemo(() => {
    const safeRows = Array.isArray(invoiceRows) ? invoiceRows : [];
    return safeRows.find((row) => row.id === selectedInvoiceId) ?? null;
  }, [invoiceRows, selectedInvoiceId]);

  useEffect(() => {
    if (!selectedInvoice) {
      setInvoiceDelegateActorId("");
      setInvoiceRecommenderActorId("");
      setInvoiceAffiliateAccountId("");
      return;
    }

    setInvoiceDelegateActorId(selectedInvoice.delegate_id ?? "");
    setInvoiceRecommenderActorId(selectedInvoice.recommender_id ?? "");
    setInvoiceAffiliateAccountId(selectedInvoice.affiliate_account_id ?? "");
  }, [selectedInvoice]);

  async function saveAssignment(body: SaveBody) {
    const response = await fetch("/api/control-room/el-elyon/client-assignments/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? "No se ha podido guardar la asignación.");
    }
  }

  async function saveAffiliateAssignment(args: {
    clientId: string;
    affiliateAccountId: string | null;
  }) {
    const response = await fetch(
      "/api/control-room/el-elyon/client-assignments/upsert-affiliate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? "No se ha podido guardar el affiliate.");
    }
  }

  async function handleSaveClientAssignments() {
    if (!viewerCanManageClientAssignments) {
      setError("No tienes permisos para editar asignaciones de clientes.");
      return;
    }

    if (!selectedClient) {
      setError("Debes seleccionar un cliente.");
      return;
    }

    if (recommenderClientId && recommenderClientId === selectedClient.id) {
      setError("El recomendador no puede ser el mismo cliente.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "delegate",
        actorId: delegateActorId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "recommender",
        recommenderClientId: recommenderClientId || null,
      });

      await saveAffiliateAssignment({
        clientId: selectedClient.id,
        affiliateAccountId: affiliateAccountId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "kol",
        actorId: kolActorId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "coordinator",
        actorId: coordinatorActorId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "commissionist_1",
        actorId: commissionist1ActorId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "commissionist_2",
        actorId: commissionist2ActorId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "commissionist_3",
        actorId: commissionist3ActorId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "commissionist_4",
        actorId: commissionist4ActorId || null,
      });

      await saveAssignment({
        clientHoldedContactId: selectedClient.holdedContactId,
        assignmentRole: "commissionist_5",
        actorId: commissionist5ActorId || null,
      });

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado guardando cambios.");
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoiceOverride(body: {
    invoice_id: string;
    target: "DELEGATE" | "RECOMMENDER" | "AFFILIATE";
    mode: "set" | "clear";
    actor_id?: string | null;
    affiliate_account_id?: string | null;
  }) {
    const response = await fetch("/api/control-room/el-elyon/invoices/actor-override", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as InvoiceOverrideResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? "No se pudo guardar el override de factura.");
    }

    return data;
  }

  async function handleSaveInvoiceAssignments() {
    if (!viewerCanManageInvoiceOverrides) {
      setInvoiceError("Solo Melquisedec puede editar overrides por factura.");
      return;
    }

    if (!selectedInvoice) {
      setInvoiceError("Debes seleccionar una factura.");
      return;
    }

    try {
      setInvoiceSaving(true);
      setInvoiceError(null);

      await saveInvoiceOverride({
        invoice_id: selectedInvoice.id,
        target: "DELEGATE",
        mode: invoiceDelegateActorId ? "set" : "clear",
        actor_id: invoiceDelegateActorId || null,
      });

      await saveInvoiceOverride({
        invoice_id: selectedInvoice.id,
        target: "RECOMMENDER",
        mode: invoiceRecommenderActorId ? "set" : "clear",
        actor_id: invoiceRecommenderActorId || null,
      });

      await saveInvoiceOverride({
        invoice_id: selectedInvoice.id,
        target: "AFFILIATE",
        mode: invoiceAffiliateAccountId ? "set" : "clear",
        affiliate_account_id: invoiceAffiliateAccountId || null,
      });

      await loadInvoiceRows(invoiceMonth);
    } catch (err) {
      setInvoiceError(
        err instanceof Error ? err.message : "Error inesperado guardando overrides.",
      );
    } finally {
      setInvoiceSaving(false);
    }
  }

  const invoiceMonths = useMemo(() => monthOptions(18), []);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#e7d9bf] bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold tracking-tight text-[#5a2e3a]">{title}</h2>
          <p className="mt-2 text-sm text-[#6b7280]">
            Espacio canónico para gestionar asignaciones activas de cliente y gobierno por
            factura. Affiliate forma parte del bloque de Clientes canonizados. Los overrides
            por factura solo puede editarlos Melquisedec.
          </p>
        </div>
      </section>

      <ElElyonClientsPanel
        loading={loading}
        saving={saving || !viewerCanManageClientAssignments}
        error={error}
        filteredClients={Array.isArray(filteredClients) ? filteredClients : []}
        selectedClientId={selectedClientId}
        selectedClient={selectedClient}
        search={search}
        delegateActorId={delegateActorId}
        recommenderClientId={recommenderClientId}
        affiliateAccountId={affiliateAccountId}
        kolActorId={kolActorId}
        coordinatorActorId={coordinatorActorId}
        commissionist1ActorId={commissionist1ActorId}
        commissionist2ActorId={commissionist2ActorId}
        commissionist3ActorId={commissionist3ActorId}
        commissionist4ActorId={commissionist4ActorId}
        commissionist5ActorId={commissionist5ActorId}
        delegates={Array.isArray(delegates) ? delegates : []}
        recommenders={Array.isArray(recommenders) ? recommenders : []}
        affiliates={Array.isArray(affiliates) ? affiliates : []}
        kols={Array.isArray(kols) ? kols : []}
        coordinators={Array.isArray(coordinators) ? coordinators : []}
        commissionists={Array.isArray(commissionists) ? commissionists : []}
        canEditAffiliate={viewerCanManageClientAssignments}
        onSearchChange={setSearch}
        onSelectClient={setSelectedClientId}
        onDelegateChange={viewerCanManageClientAssignments ? setDelegateActorId : () => {}}
        onRecommenderChange={
          viewerCanManageClientAssignments ? setRecommenderClientId : () => {}
        }
        onAffiliateChange={
          viewerCanManageClientAssignments ? setAffiliateAccountId : () => {}
        }
        onKolChange={viewerCanManageClientAssignments ? setKolActorId : () => {}}
        onCoordinatorChange={
          viewerCanManageClientAssignments ? setCoordinatorActorId : () => {}
        }
        onCommission1Change={
          viewerCanManageClientAssignments ? setCommissionist1ActorId : () => {}
        }
        onCommission2Change={
          viewerCanManageClientAssignments ? setCommissionist2ActorId : () => {}
        }
        onCommission3Change={
          viewerCanManageClientAssignments ? setCommissionist3ActorId : () => {}
        }
        onCommission4Change={
          viewerCanManageClientAssignments ? setCommissionist4ActorId : () => {}
        }
        onCommission5Change={
          viewerCanManageClientAssignments ? setCommissionist5ActorId : () => {}
        }
      />

      <ElElyonInvoicesPanel
        invoiceLoading={invoiceLoading}
        invoiceSaving={invoiceSaving}
        invoiceError={
          invoiceError ??
          (viewerCanManageInvoiceOverrides
            ? null
            : "Solo Melquisedec puede editar overrides por factura.")
        }
        invoiceRows={Array.isArray(invoiceRows) ? invoiceRows : []}
        filteredInvoiceRows={Array.isArray(filteredInvoiceRows) ? filteredInvoiceRows : []}
        selectedInvoiceId={selectedInvoiceId}
        selectedInvoice={selectedInvoice}
        invoiceMonth={invoiceMonth}
        invoiceMonths={invoiceMonths}
        invoiceSearch={invoiceSearch}
        editorActors={Array.isArray(editorActors) ? editorActors : []}
        editorAffiliates={Array.isArray(editorAffiliates) ? editorAffiliates : []}
        invoiceDelegateActorId={invoiceDelegateActorId}
        invoiceRecommenderActorId={invoiceRecommenderActorId}
        invoiceAffiliateAccountId={invoiceAffiliateAccountId}
        onMonthChange={setInvoiceMonth}
        onSearchChange={setInvoiceSearch}
        onSelectInvoice={setSelectedInvoiceId}
        onDelegateChange={
          viewerCanManageInvoiceOverrides ? setInvoiceDelegateActorId : () => {}
        }
        onRecommenderChange={
          viewerCanManageInvoiceOverrides ? setInvoiceRecommenderActorId : () => {}
        }
        onAffiliateChange={
          viewerCanManageInvoiceOverrides ? setInvoiceAffiliateAccountId : () => {}
        }
        onSave={viewerCanManageInvoiceOverrides ? handleSaveInvoiceAssignments : () => {}}
      />

      {viewerCanManageClientAssignments && selectedClient ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveClientAssignments}
            disabled={saving}
            className="rounded-2xl bg-[#5a2e3a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar asignaciones de cliente"}
          </button>
        </div>
      ) : null}
    </div>
  );
}