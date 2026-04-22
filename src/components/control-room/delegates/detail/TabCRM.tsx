"use client";

// TabCRM: registro de seguimientos CRM para un delegado
// Permite a delegados y supervisores loguear interacciones con clientes.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FollowUpType = "call" | "whatsapp" | "email" | "visit" | "incident" | "note";

type ClientOption = { id: string; name: string | null };

type FollowUp = {
  id: string;
  type: FollowUpType;
  note: string;
  next_action_at: string | null;
  created_at: string;
  client: ClientOption | null;
  actor: { id: string; name: string | null; role: string | null } | null;
};

const TYPE_LABELS: Record<FollowUpType, string> = {
  call: "Llamada",
  whatsapp: "WhatsApp",
  email: "Email",
  visit: "Visita",
  incident: "Incidencia",
  note: "Nota",
};

const TYPE_COLORS: Record<FollowUpType, string> = {
  call: "#2563eb",
  whatsapp: "#16a34a",
  email: "#7c3aed",
  visit: "#d97706",
  incident: "#dc2626",
  note: "#64748b",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getToken(): Promise<string | null> {
  const sb = createClient();
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

type Props = {
  delegateId: string;
  clients: ClientOption[];
};

export default function TabCRM({ delegateId, clients }: Props) {
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formClientId, setFormClientId] = useState("");
  const [formType, setFormType] = useState<FollowUpType>("note");
  const [formNote, setFormNote] = useState("");
  const [formNextAction, setFormNextAction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/crm/followups?delegateActorId=${delegateId}&limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Error al cargar seguimientos");
      setFollowups(j.followups ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [delegateId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formClientId || !formNote.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/crm/followups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          delegate_actor_id: delegateId,
          client_id: formClientId,
          type: formType,
          note: formNote.trim(),
          next_action_at: formNextAction || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Error al guardar");
      setFormOpen(false);
      setFormNote("");
      setFormClientId("");
      setFormNextAction("");
      setFormType("note");
      await load();
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "var(--viho-foreground)" }}>
            Seguimiento CRM
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--viho-muted)" }}>
            {followups.length} interacción{followups.length !== 1 ? "es" : ""} registrada{followups.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-80"
          style={{
            borderColor: "var(--viho-primary)",
            color: formOpen ? "#fff" : "var(--viho-primary)",
            background: formOpen ? "var(--viho-primary)" : "transparent",
          }}
        >
          {formOpen ? "Cancelar" : "+ Nueva interacción"}
        </button>
      </div>

      {/* Form */}
      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border p-5 space-y-4"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--viho-muted)" }}>
                Cliente
              </label>
              <select
                required
                value={formClientId}
                onChange={(e) => setFormClientId(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)" }}
              >
                <option value="">Seleccionar cliente…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name ?? c.id}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--viho-muted)" }}>
                Tipo
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as FollowUpType)}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)" }}
              >
                {(Object.keys(TYPE_LABELS) as FollowUpType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--viho-muted)" }}>
              Nota
            </label>
            <textarea
              required
              rows={3}
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Describe la interacción…"
              className="rounded-xl border px-3 py-2 text-sm resize-none"
              style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--viho-muted)" }}>
              Próxima acción (opcional)
            </label>
            <input
              type="datetime-local"
              value={formNextAction}
              onChange={(e) => setFormNextAction(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface-2,#f9f7f4)" }}
            />
          </div>

          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--viho-primary)" }}
            >
              {submitting ? "Guardando…" : "Guardar interacción"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading && (
        <p className="text-sm" style={{ color: "var(--viho-muted)" }}>Cargando…</p>
      )}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {!loading && !error && followups.length === 0 && (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
        >
          <p className="text-sm" style={{ color: "var(--viho-muted)" }}>
            Sin interacciones registradas. Usa el botón de arriba para añadir la primera.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {followups.map((f) => (
          <div
            key={f.id}
            className="rounded-2xl border p-4"
            style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ background: TYPE_COLORS[f.type] ?? "#64748b" }}
              >
                {TYPE_LABELS[f.type] ?? f.type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-semibold" style={{ color: "var(--viho-foreground)" }}>
                    {f.client?.name ?? "Cliente desconocido"}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--viho-muted)" }}>
                    {formatDate(f.created_at)}
                  </span>
                  {f.actor?.name && (
                    <span className="text-[11px]" style={{ color: "var(--viho-muted)" }}>
                      · {f.actor.name}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--viho-foreground)" }}>
                  {f.note}
                </p>
                {f.next_action_at && (
                  <p className="mt-1 text-xs" style={{ color: "#d97706" }}>
                    Próxima acción: {formatDate(f.next_action_at)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
