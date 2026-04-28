"use client";

// TabRecomendadores: recomendadores del delegado — comisiones por periodo y gestión de clientes referidos.
// Melquisedec/supervisores pueden crear, editar y asignar clientes.
// Delegados solo pueden ver sus propios recomendadores.

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth/token";
import { formatMoney, formatMonthLabel } from "../utils";
import type {
  RecommenderRow,
  RecommenderClientAssignment,
  RecommendersApiResponse,
} from "../types";

type Props = {
  delegateId: string;
  month: string;
  isMelquisedec: boolean;
};

export default function TabRecomendadores({ delegateId, month, isMelquisedec }: Props) {
  const [recommenders, setRecommenders] = useState<RecommenderRow[]>([]);
  const [totalCommission, setTotalCommission] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected recommender for client panel
  const [selectedRec, setSelectedRec] = useState<RecommenderRow | null>(null);

  // Create form
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPct, setFormPct] = useState("0");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Edit modal
  const [editRec, setEditRec] = useState<RecommenderRow | null>(null);
  const [editPct, setEditPct] = useState("0");
  const [editActive, setEditActive] = useState(true);
  const [editNotes, setEditNotes] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/control-room/delegates/${delegateId}/recommenders?month=${month}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }
      );
      const data = (await res.json().catch(() => null)) as RecommendersApiResponse | { ok: false; error: string } | null;
      if (!data?.ok) {
        setError((data as { ok: false; error: string } | null)?.error ?? "Error al cargar recomendadores");
        return;
      }
      setRecommenders(data.recommenders);
      setTotalCommission(data.period.total_commission);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [delegateId, month]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/control-room/delegates/${delegateId}/recommenders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: formName,
          email: formEmail || undefined,
          phone: formPhone || undefined,
          commission_pct: parseFloat(formPct) || 0,
          notes: formNotes || undefined,
        }),
      });
      const data = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!data?.ok) {
        setSubmitError(data?.error ?? "Error al crear recomendador");
        return;
      }
      setFormOpen(false);
      setFormName(""); setFormEmail(""); setFormPhone(""); setFormPct("0"); setFormNotes("");
      void load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(rec: RecommenderRow) {
    setEditRec(rec);
    setEditPct(String(rec.commission_pct));
    setEditActive(rec.active);
    setEditNotes(rec.notes ?? "");
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRec) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/control-room/delegates/${delegateId}/recommenders/${editRec.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            commission_pct: parseFloat(editPct) || 0,
            active: editActive,
            notes: editNotes || null,
          }),
        }
      );
      const data = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!data?.ok) {
        setEditError(data?.error ?? "Error al guardar");
        return;
      }
      setEditRec(null);
      void load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(rec: RecommenderRow) {
    if (!confirm(`¿Eliminar recomendador "${rec.name}"? Esta acción no se puede deshacer.`)) return;
    const token = await getAccessToken();
    await fetch(`/api/control-room/delegates/${delegateId}/recommenders/${rec.id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    void load();
  }

  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center text-sm text-[color:var(--viho-muted)]">
        Cargando recomendadores…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + KPI */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-[color:var(--viho-primary)]">
            Recomendadores — {formatMonthLabel(month)}
          </div>
          <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
            {recommenders.length} recomendador{recommenders.length !== 1 ? "es" : ""}
            {" · "}
            <span className="font-semibold text-[color:var(--viho-primary)]">
              Comisión total: {formatMoney(totalCommission)}
            </span>
          </div>
        </div>
        {isMelquisedec && (
          <button
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#C7822A] bg-[#C7822A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b06f22] transition-colors"
          >
            + Nuevo recomendador
          </button>
        )}
      </div>

      {/* Create form */}
      {formOpen && isMelquisedec && (
        <div className="rounded-[20px] border border-[#C7822A]/40 bg-amber-50 p-5">
          <div className="mb-4 text-sm font-semibold text-[color:var(--viho-primary)]">
            Nuevo recomendador
          </div>
          <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Nombre *</label>
              <input
                className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Teléfono</label>
              <input
                className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Comisión % *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                value={formPct}
                onChange={(e) => setFormPct(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Notas</label>
              <input
                className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
            {submitError && (
              <div className="sm:col-span-2 text-xs text-red-600">{submitError}</div>
            )}
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#C7822A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#b06f22] transition-colors"
              >
                {submitting ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-[color:var(--viho-border)] px-4 py-2 text-sm text-[color:var(--viho-muted)] hover:bg-neutral-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit modal */}
      {editRec && isMelquisedec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[20px] border border-[color:var(--viho-border)] bg-white p-6 shadow-xl">
            <div className="mb-4 text-base font-semibold text-[color:var(--viho-primary)]">
              Editar — {editRec.name}
            </div>
            <form onSubmit={(e) => void handleEdit(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Comisión %</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                  value={editPct}
                  onChange={(e) => setEditPct(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="edit-active" className="text-sm text-[color:var(--viho-primary)]">Activo</label>
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Notas</label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
              {editError && <div className="text-xs text-red-600">{editError}</div>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="rounded-lg bg-[#C7822A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#b06f22] transition-colors"
                >
                  {editSubmitting ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditRec(null)}
                  className="rounded-lg border border-[color:var(--viho-border)] px-4 py-2 text-sm text-[color:var(--viho-muted)] hover:bg-neutral-100"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client assignments panel */}
      {selectedRec && (
        <ClientAssignmentsPanel
          delegateId={delegateId}
          recommender={selectedRec}
          isMelquisedec={isMelquisedec}
          onClose={() => setSelectedRec(null)}
        />
      )}

      {/* Recommender list */}
      {recommenders.length === 0 ? (
        <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white px-5 py-10 text-center text-sm text-[color:var(--viho-muted)]">
          No hay recomendadores registrados para este delegado.
        </div>
      ) : (
        <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2,#f9f7f4)] text-left">
                <th className="px-4 py-3 font-semibold text-[color:var(--viho-primary)]">Recomendador</th>
                <th className="px-4 py-3 font-semibold text-[color:var(--viho-primary)] text-right">Comisión %</th>
                <th className="px-4 py-3 font-semibold text-[color:var(--viho-primary)] text-right">Clientes</th>
                <th className="px-4 py-3 font-semibold text-[color:var(--viho-primary)] text-right">Base comisionable</th>
                <th className="px-4 py-3 font-semibold text-[color:var(--viho-primary)] text-right">Comisión período</th>
                <th className="px-4 py-3 font-semibold text-[color:var(--viho-primary)] text-right">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--viho-border)]">
              {recommenders.map((rec) => (
                <tr key={rec.id} className="hover:bg-[color:var(--viho-surface-2,#f9f7f4)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[color:var(--viho-primary)]">{rec.name}</div>
                    {rec.email && (
                      <div className="text-xs text-[color:var(--viho-muted)]">{rec.email}</div>
                    )}
                    {rec.phone && (
                      <div className="text-xs text-[color:var(--viho-muted)]">{rec.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[color:var(--viho-primary)]">
                    {rec.commission_pct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right text-[color:var(--viho-muted)]">
                    <button
                      onClick={() => setSelectedRec(rec)}
                      className="underline underline-offset-2 hover:text-[#C7822A] transition-colors"
                    >
                      {rec.clients_assigned}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-[color:var(--viho-muted)]">
                    {formatMoney(rec.period.net_commissionable)}
                    {rec.period.invoice_count > 0 && (
                      <div className="text-xs text-[color:var(--viho-muted)]">
                        {rec.period.invoice_count} factura{rec.period.invoice_count !== 1 ? "s" : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <span className={rec.period.commission_amount > 0 ? "text-emerald-700" : "text-[color:var(--viho-muted)]"}>
                      {formatMoney(rec.period.commission_amount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={[
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                      rec.active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-neutral-200 bg-neutral-100 text-neutral-500",
                    ].join(" ")}>
                      {rec.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isMelquisedec && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(rec)}
                          className="rounded-lg border border-[color:var(--viho-border)] px-2.5 py-1 text-xs hover:bg-neutral-100 transition-colors"
                          title="Editar"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setSelectedRec(rec)}
                          className="rounded-lg border border-[color:var(--viho-border)] px-2.5 py-1 text-xs hover:bg-neutral-100 transition-colors"
                          title="Gestionar clientes"
                        >
                          Clientes
                        </button>
                        <button
                          onClick={() => void handleDelete(rec)}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {recommenders.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2,#f9f7f4)]">
                  <td colSpan={4} className="px-4 py-3 font-semibold text-[color:var(--viho-primary)]">
                    Total a deducir de liquidación
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">
                    {formatMoney(totalCommission)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: client assignments for a single recommender
// ---------------------------------------------------------------------------

function ClientAssignmentsPanel({
  delegateId,
  recommender,
  isMelquisedec,
  onClose,
}: {
  delegateId: string;
  recommender: RecommenderRow;
  isMelquisedec: boolean;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<RecommenderClientAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addClientId, setAddClientId] = useState("");
  const [addPct, setAddPct] = useState("");
  const [addValidFrom, setAddValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/control-room/delegates/${delegateId}/recommenders/${recommender.id}/clients`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }
      );
      const data = await res.json().catch(() => null) as { ok: boolean; clients?: RecommenderClientAssignment[]; error?: string } | null;
      if (!data?.ok) {
        setError(data?.error ?? "Error al cargar clientes");
        return;
      }
      setClients(data.clients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [delegateId, recommender.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addClientId.trim()) return;
    setAddSubmitting(true);
    setAddError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/control-room/delegates/${delegateId}/recommenders/${recommender.id}/clients`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            client_id: addClientId.trim(),
            commission_pct: addPct ? parseFloat(addPct) : null,
            valid_from: addValidFrom,
          }),
        }
      );
      const data = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!data?.ok) {
        setAddError(data?.error ?? "Error al asignar cliente");
        return;
      }
      setAddClientId("");
      setAddPct("");
      void load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleRemove(clientId: string) {
    const token = await getAccessToken();
    await fetch(
      `/api/control-room/delegates/${delegateId}/recommenders/${recommender.id}/clients?client_id=${clientId}`,
      { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    void load();
  }

  return (
    <div className="rounded-[20px] border border-[#C7822A]/40 bg-amber-50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-semibold text-[color:var(--viho-primary)]">
            Clientes referidos por {recommender.name}
          </span>
          <span className="ml-2 text-sm text-[color:var(--viho-muted)]">
            (comisión base: {recommender.commission_pct.toFixed(2)}%)
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-[color:var(--viho-muted)] hover:text-[color:var(--viho-primary)]"
        >
          Cerrar
        </button>
      </div>

      {loading ? (
        <div className="py-4 text-sm text-[color:var(--viho-muted)]">Cargando…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <>
          {clients.length === 0 ? (
            <div className="py-4 text-sm text-[color:var(--viho-muted)]">
              Sin clientes asignados a este recomendador.
            </div>
          ) : (
            <table className="w-full mb-4 text-sm">
              <thead>
                <tr className="border-b border-[color:var(--viho-border)] text-left">
                  <th className="pb-2 font-semibold text-[color:var(--viho-primary)]">Cliente</th>
                  <th className="pb-2 font-semibold text-[color:var(--viho-primary)] text-right">Comisión %</th>
                  <th className="pb-2 font-semibold text-[color:var(--viho-primary)]">Desde</th>
                  <th className="pb-2 font-semibold text-[color:var(--viho-primary)]">Hasta</th>
                  {isMelquisedec && <th></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--viho-border)]">
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 font-medium text-[color:var(--viho-primary)]">
                      {c.client_name}
                      <div className="text-xs text-[color:var(--viho-muted)] font-mono">{c.client_id}</div>
                    </td>
                    <td className="py-2 text-right text-[color:var(--viho-muted)]">
                      {c.commission_pct !== null ? `${c.commission_pct.toFixed(2)}%` : `${recommender.commission_pct.toFixed(2)}% (default)`}
                    </td>
                    <td className="py-2 text-[color:var(--viho-muted)]">{c.valid_from ?? "—"}</td>
                    <td className="py-2 text-[color:var(--viho-muted)]">{c.valid_to ?? "—"}</td>
                    {isMelquisedec && (
                      <td className="py-2 text-right">
                        <button
                          onClick={() => void handleRemove(c.client_id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isMelquisedec && (
            <form onSubmit={(e) => void handleAdd(e)} className="border-t border-[color:var(--viho-border)] pt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">ID de cliente *</label>
                <input
                  className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm font-mono"
                  placeholder="UUID del cliente"
                  value={addClientId}
                  onChange={(e) => setAddClientId(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Comisión % (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                  placeholder="Default"
                  value={addPct}
                  onChange={(e) => setAddPct(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--viho-muted)] mb-1">Válido desde</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-[color:var(--viho-border)] px-3 py-2 text-sm"
                  value={addValidFrom}
                  onChange={(e) => setAddValidFrom(e.target.value)}
                />
              </div>
              {addError && <div className="sm:col-span-4 text-xs text-red-600">{addError}</div>}
              <div className="sm:col-span-4">
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="rounded-lg bg-[#C7822A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#b06f22] transition-colors"
                >
                  {addSubmitting ? "Asignando…" : "Asignar cliente"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
