"use client";

import { useEffect, useMemo, useState } from "react";

type EligibleActor = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  roles: string[];
};

type ClientAssignmentInfo = {
  actorId: string;
  actorName: string | null;
  source: string | null;
  validFrom: string | null;
};

type ClientItem = {
  id: string;
  name: string | null;
  holdedContactId: string;
  delegate: ClientAssignmentInfo | null;
  recommender: ClientAssignmentInfo | null;
};

type ApiResponse = {
  ok: boolean;
  viewer?: {
    actorId: string;
    actorName: string | null;
    roles: string[];
  };
  dictionaries?: {
    delegates: EligibleActor[];
    recommenders: EligibleActor[];
    kols: EligibleActor[];
    coordinators: EligibleActor[];
  };
  clients?: ClientItem[];
  error?: string;
};

type SaveBody = {
  clientHoldedContactId: string;
  assignmentRole: "delegate" | "recommender";
  actorId: string | null;
};

type Props = {
  title?: string;
};

export default function ElElyonAssignmentsWorkspace({
  title = "Gobernanza de asignaciones",
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientItem[]>([]);
  const [delegates, setDelegates] = useState<EligibleActor[]>([]);
  const [recommenders, setRecommenders] = useState<EligibleActor[]>([]);
  const [kols, setKols] = useState<EligibleActor[]>([]);
  const [coordinators, setCoordinators] = useState<EligibleActor[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [search, setSearch] = useState("");

  const [delegateActorId, setDelegateActorId] = useState<string>("");
  const [recommenderActorId, setRecommenderActorId] = useState<string>("");

  const [structureDelegateId, setStructureDelegateId] = useState<string>("");
  const [structureKolId, setStructureKolId] = useState<string>("");
  const [structureCoordinatorId, setStructureCoordinatorId] = useState<string>("");

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/control-room/el-elyon/client-assignments", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok || !data.dictionaries || !data.clients) {
        setError(data.error ?? "No se ha podido cargar El-Elyon.");
        return;
      }

      setClients(data.clients);
      setDelegates(data.dictionaries.delegates);
      setRecommenders(data.dictionaries.recommenders);
      setKols(data.dictionaries.kols);
      setCoordinators(data.dictionaries.coordinators);

      if (!selectedClientId && data.clients.length > 0) {
        setSelectedClientId(data.clients[0]!.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado cargando datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredClients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return clients;

    return clients.filter((client) => {
      const haystack = [
        client.name ?? "",
        client.holdedContactId,
        client.delegate?.actorName ?? "",
        client.recommender?.actorName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [clients, search]);

  const selectedClient = useMemo(() => {
    return clients.find((client) => client.id === selectedClientId) ?? null;
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (!selectedClient) {
      setDelegateActorId("");
      setRecommenderActorId("");
      return;
    }

    setDelegateActorId(selectedClient.delegate?.actorId ?? "");
    setRecommenderActorId(selectedClient.recommender?.actorId ?? "");
  }, [selectedClient]);

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

  async function handleSaveClientAssignments() {
    if (!selectedClient) {
      setError("Debes seleccionar un cliente.");
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
        actorId: recommenderActorId || null,
      });

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado guardando cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#e7d9bf] bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold tracking-tight text-[#5a2e3a]">{title}</h2>
          <p className="mt-2 text-sm text-[#6b7280]">
            Espacio canónico para gestionar asignaciones activas de cliente a delegado y
            recomendador. Basado en <code>client_actor_assignments_g1</code> y{" "}
            <code>holded_contact_id</code>.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <div className="rounded-[24px] border border-[#eee2ca] bg-[#fcfaf5] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-[#5a2e3a]">Clientes canonizados</h3>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-[#8b5e3c] shadow-sm">
                {filteredClients.length} visibles
              </span>
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente, holded contact, delegado o recomendador"
                className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
              />
            </div>

            <div className="max-h-[560px] overflow-auto rounded-2xl border border-[#eadfcf] bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-[#fbf6ec]">
                  <tr className="border-b border-[#eadfcf] text-left text-[#5a2e3a]">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Delegado</th>
                    <th className="px-4 py-3 font-medium">Recomendador</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const active = client.id === selectedClientId;

                    return (
                      <tr
                        key={client.id}
                        onClick={() => setSelectedClientId(client.id)}
                        className={`cursor-pointer border-b border-[#f1e9db] transition ${
                          active ? "bg-[#fff5df]" : "hover:bg-[#fcfaf5]"
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-[#3f2a31]">{client.name ?? "Sin nombre"}</div>
                          <div className="mt-1 text-xs text-[#8a8f98]">{client.holdedContactId}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-[#5f6670]">
                          {client.delegate?.actorName ?? "—"}
                        </td>
                        <td className="px-4 py-3 align-top text-[#5f6670]">
                          {client.recommender?.actorName ?? "—"}
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-[#8a8f98]">
                        No hay resultados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] border border-[#eee2ca] bg-[#fcfaf5] p-5">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-[#5a2e3a]">
                  Asignación de cliente
                </h3>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Cambia delegado y recomendador activos del cliente seleccionado.
                </p>
              </div>

              {selectedClient ? (
                <div className="mb-4 rounded-2xl border border-[#eadfcf] bg-white px-4 py-4 text-sm">
                  <div className="font-medium text-[#3f2a31]">{selectedClient.name ?? "Sin nombre"}</div>
                  <div className="mt-1 text-xs text-[#8a8f98]">
                    Holded Contact ID: {selectedClient.holdedContactId}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[#6b7280]">
                    <div>
                      Delegado actual:{" "}
                      <strong className="text-[#5a2e3a]">
                        {selectedClient.delegate?.actorName ?? "Sin asignar"}
                      </strong>
                    </div>
                    <div>
                      Recomendador actual:{" "}
                      <strong className="text-[#5a2e3a]">
                        {selectedClient.recommender?.actorName ?? "Sin asignar"}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 rounded-2xl border border-[#eadfcf] bg-white px-4 py-4 text-sm text-[#8a8f98]">
                  Selecciona un cliente en la tabla.
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                    Delegado
                  </label>
                  <select
                    value={delegateActorId}
                    onChange={(e) => setDelegateActorId(e.target.value)}
                    disabled={!selectedClient || loading || saving}
                    className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                  >
                    <option value="">Sin asignar</option>
                    {delegates.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name ?? row.email ?? row.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                    Recomendador
                  </label>
                  <select
                    value={recommenderActorId}
                    onChange={(e) => setRecommenderActorId(e.target.value)}
                    disabled={!selectedClient || loading || saving}
                    className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                  >
                    <option value="">Sin asignar</option>
                    {recommenders.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name ?? row.email ?? row.id}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSaveClientAssignments}
                  disabled={!selectedClient || loading || saving}
                  className="inline-flex rounded-2xl bg-[#5a2e3a] px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar asignaciones del cliente"}
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#eee2ca] bg-[#fcfaf5] p-5">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-[#5a2e3a]">
                  Estructura comercial del delegado
                </h3>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Bloque preparado para asignar un delegado a su KOL y a su coordinador comercial.
                  La persistencia no se conecta todavía para no inventar una tabla canónica actor→actor.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                    Delegado
                  </label>
                  <select
                    value={structureDelegateId}
                    onChange={(e) => setStructureDelegateId(e.target.value)}
                    className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                  >
                    <option value="">Selecciona delegado</option>
                    {delegates.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name ?? row.email ?? row.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                    KOL
                  </label>
                  <select
                    value={structureKolId}
                    onChange={(e) => setStructureKolId(e.target.value)}
                    className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                  >
                    <option value="">Sin asignar</option>
                    {kols.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name ?? row.email ?? row.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5a2e3a]">
                    Coordinador comercial
                  </label>
                  <select
                    value={structureCoordinatorId}
                    onChange={(e) => setStructureCoordinatorId(e.target.value)}
                    className="w-full rounded-2xl border border-[#d8c5a2] bg-white px-4 py-3 text-sm outline-none focus:border-[#c7ae6a]"
                  >
                    <option value="">Sin asignar</option>
                    {coordinators.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name ?? row.email ?? row.id}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled
                  className="inline-flex rounded-2xl bg-[#cbb68a] px-5 py-3 text-sm font-medium text-white opacity-70"
                >
                  Persistencia pendiente de tabla canónica actor→actor
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}