"use client";

// src/components/control-room/delegates/detail/TabEditar.tsx
// Formulario de edición de datos básicos del delegado.
// Solo visible y funcional para Melquisedec.

import { useState } from "react";
import { getAccessToken } from "@/lib/auth/token";
import type { DelegateDetailActor } from "../types";

type Props = {
  delegate: DelegateDetailActor;
  onSaved: (updated: DelegateDetailActor) => void;
};

type FormState = {
  name: string;
  email: string;
  status: string;
  company: string;
  job_title: string;
  department: string;
  commission_level: string;
};

export default function TabEditar({ delegate, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    name: delegate.name ?? "",
    email: delegate.email ?? "",
    status: delegate.status ?? "",
    company: delegate.company ?? "",
    job_title: delegate.job_title ?? "",
    department: delegate.department ?? "",
    commission_level: delegate.commission_level != null ? String(delegate.commission_level) : "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccess(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const token = await getAccessToken();

      const body: Record<string, unknown> = {
        name: form.name.trim() || null,
        email: form.email.trim() || null,
        status: form.status.trim() || null,
        company: form.company.trim() || null,
        job_title: form.job_title.trim() || null,
        department: form.department.trim() || null,
        commission_level: form.commission_level !== "" ? Number(form.commission_level) : null,
      };

      const res = await fetch(
        `/api/control-room/delegates/${encodeURIComponent(delegate.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        }
      );

      const payload = await res.json().catch(() => null) as { ok?: boolean; error?: string; delegate?: DelegateDetailActor } | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? "Error guardando los cambios");
        return;
      }

      if (payload.delegate) {
        onSaved(payload.delegate);
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Banner Melquisedec */}
      <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
        <strong>Melquisedec:</strong> Estás editando los datos del delegado{" "}
        <strong>{delegate.name ?? delegate.id}</strong>. Todos los cambios quedan registrados en el
        log de auditoría.
      </div>

      {/* Formulario */}
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
          <div className="text-base font-semibold text-[color:var(--viho-primary)]">
            Datos del delegado
          </div>
          <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
            ID: <span className="font-mono">{delegate.id}</span>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nombre"
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder="Nombre completo"
            />
            <Field
              label="Email"
              value={form.email}
              onChange={(v) => set("email", v)}
              type="email"
              placeholder="correo@ejemplo.com"
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
                Estado
              </label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[color:var(--viho-border)] bg-white px-3 py-2 text-sm text-[color:var(--viho-primary)] focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <option value="">— sin especificar —</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="suspended">suspended</option>
              </select>
            </div>
            <Field
              label="Empresa"
              value={form.company}
              onChange={(v) => set("company", v)}
              placeholder="Nombre de empresa"
            />
            <Field
              label="Cargo"
              value={form.job_title}
              onChange={(v) => set("job_title", v)}
              placeholder="Cargo o posición"
            />
            <Field
              label="Departamento"
              value={form.department}
              onChange={(v) => set("department", v)}
              placeholder="Departamento"
            />
            <Field
              label="Nivel de comisión"
              value={form.commission_level}
              onChange={(v) => set("commission_level", v)}
              type="number"
              placeholder="Ej. 1"
            />
          </div>

          {/* Feedback */}
          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Datos guardados correctamente.
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center rounded-xl border border-purple-300 bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-[color:var(--viho-border)] bg-white px-3 py-2 text-sm text-[color:var(--viho-primary)] focus:outline-none focus:ring-2 focus:ring-purple-300"
      />
    </div>
  );
}
