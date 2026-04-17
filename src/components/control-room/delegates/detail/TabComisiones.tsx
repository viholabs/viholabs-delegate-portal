"use client";

// src/components/control-room/delegates/detail/TabComisiones.tsx
// Configuración vigente de comisiones y acumulados del periodo.
// REGLA CRÍTICA: solo Melquisedec puede editar reglas. Todos los demás: solo lectura.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CommissionRule, DetailPeriodStats, DelegateDetailActor } from "../types";
import { formatMoney, formatDate } from "../utils";

type Props = {
  rules: CommissionRule[];
  period: DetailPeriodStats;
  viewer: { actorId: string; isMelquisedec: boolean; canEdit: boolean };
  delegate: DelegateDetailActor;
  onRefresh: () => void;
};

export default function TabComisiones({ rules, period, viewer, delegate, onRefresh }: Props) {
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);

  // Separar reglas específicas del delegado vs globales
  const delegateSpecificRules = rules.filter((r) => r.delegate_id === delegate.id);
  const globalRules = rules.filter((r) => r.delegate_id === null);

  // Las reglas activas a mostrar (específicas tienen precedencia)
  const activeRules = delegateSpecificRules.length > 0 ? delegateSpecificRules : globalRules;

  return (
    <div className="space-y-6">
      {/* Modal de edición de regla */}
      {editingRule && viewer.isMelquisedec && (
        <RuleEditModal
          rule={editingRule}
          delegateId={delegate.id}
          onClose={() => setEditingRule(null)}
          onSaved={() => { setEditingRule(null); onRefresh(); }}
        />
      )}
      {/* Permiso de edición */}
      {!viewer.isMelquisedec && (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          <strong>Solo lectura.</strong> La configuración de comisiones solo puede ser modificada
          por Melquisedec. Tu perfil tiene acceso de visualización.
        </div>
      )}
      {viewer.isMelquisedec && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
          <strong>Melquisedec:</strong> Tienes permiso de edición sobre comisiones, porcentajes,
          importes fijos, reglas vigentes y acumulados manuales. Todos los cambios quedan
          registrados en el log de auditoría.
        </div>
      )}

      {/* Configuración vigente */}
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[color:var(--viho-primary)]">
                Configuración vigente
              </div>
              <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
                {delegateSpecificRules.length > 0
                  ? "Reglas específicas para este delegado"
                  : "Aplicando tabla general (sin reglas específicas para este delegado)"}
              </div>
            </div>
            {viewer.isMelquisedec && (
              <span className="inline-flex items-center rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700">
                Edición habilitada
              </span>
            )}
          </div>
        </div>

        {/* Reglas genéricas del modelo */}
        <div className="p-5 space-y-4">
          {/* Regla de precio de referencia */}
          <div className="rounded-2xl border border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)] px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Precio de referencia" value="31,00 €" />
              <Field label="SKU válido" value="VIHO-OBE-SPRAY-002" />
              <Field label="Aplica a" value="Solo unidades vendidas (no promo/FOC)" />
            </div>
            <div className="mt-3 text-xs text-[color:var(--viho-muted)]">
              Solo las unidades al precio estipulado de 31,00 € forman la base comisionable.
              IVA, recargo de equivalencia, transporte y otros conceptos no producto están
              excluidos.
            </div>
          </div>

          {/* Tabla de tiers */}
          {activeRules.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)]">
                    <Th>Canal</Th>
                    <Th>Año</Th>
                    <Th align="right">Desde (ud.)</Th>
                    <Th align="right">Hasta (ud.)</Th>
                    <Th align="right">% Comisión</Th>
                    <Th align="right">Precio ref.</Th>
                    <Th>Vigente desde</Th>
                    <Th>Vigente hasta</Th>
                    <Th>Tipo</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--viho-border)]">
                  {activeRules.map((rule) => (
                    <CommissionRuleRow
                      key={rule.id}
                      rule={rule}
                      delegateId={delegate.id}
                      canEdit={viewer.isMelquisedec}
                      onEdit={() => setEditingRule(rule)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-4 text-sm text-[color:var(--viho-muted)]">
              No hay reglas de comisión activas configuradas.
            </div>
          )}
        </div>
      </div>

      {/* Acumulados del periodo */}
      <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
          <div className="text-base font-semibold text-[color:var(--viho-primary)]">
            Acumulados del periodo
          </div>
          <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">
            Calculados en tiempo real para {period.month}
          </div>
        </div>

        <div className="grid gap-px bg-[color:var(--viho-border)] sm:grid-cols-2 lg:grid-cols-4">
          <AccumCell
            label="Acumulado mes (unidades cobradas)"
            value={String(period.units_liquidable)}
            sub="Ud. de facturas cobradas"
          />
          <AccumCell
            label="Base comisionable acumulada"
            value={formatMoney(period.net_commissionable)}
            sub={`${period.units_liquidable} ud. × 31,00 €`}
          />
          <AccumCell
            label="Comisión acumulada mes"
            value={formatMoney(period.commission_provisional)}
            sub={
              period.applied_tier_percentage != null
                ? `Tier ${period.applied_tier_percentage}%`
                : "Sin tier"
            }
          />
          <AccumCell
            label="Pendiente de cobro"
            value={formatMoney(period.billing_pending_gross + period.billing_overdue_gross)}
            sub={`${period.billing_pending_count + period.billing_overdue_count} facturas`}
          />
        </div>

        <div className="px-5 py-4">
          <p className="text-xs text-[color:var(--viho-muted)]">
            Los ajustes manuales y acumulados históricos se gestionan a través del módulo de
            liquidación formal (propuestas). Solo Melquisedec puede introducir ajustes
            extraordinarios.
          </p>
        </div>
      </div>

      {/* Reglas globales para referencia */}
      {delegateSpecificRules.length > 0 && globalRules.length > 0 && (
        <details className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-[color:var(--viho-muted)]">
            Ver tabla general (no aplica a este delegado)
          </summary>
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--viho-border)]">
                  <Th>Canal</Th>
                  <Th align="right">Desde</Th>
                  <Th align="right">Hasta</Th>
                  <Th align="right">%</Th>
                  <Th>Tipo</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--viho-border)]">
                {globalRules.map((rule) => (
                  <CommissionRuleRow
                    key={rule.id}
                    rule={rule}
                    delegateId={delegate.id}
                    canEdit={viewer.isMelquisedec}
                    onEdit={() => setEditingRule(rule)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CommissionRuleRow({
  rule,
  delegateId,
  canEdit,
  onEdit,
}: {
  rule: CommissionRule;
  delegateId: string;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const isSpecific = rule.delegate_id === delegateId;
  return (
    <tr className="hover:bg-[color:var(--viho-surface-2)]">
      <Td>{rule.channel.toUpperCase()}</Td>
      <Td>{rule.year}</Td>
      <Td align="right">{rule.from_units}</Td>
      <Td align="right">{rule.to_units >= 999999 ? "∞" : rule.to_units}</Td>
      <Td align="right">
        <span className="font-semibold text-[color:var(--viho-primary)]">{rule.percentage}%</span>
      </Td>
      <Td align="right">{rule.reference_price.toFixed(2)} €</Td>
      <Td>
        <span className="text-xs text-[color:var(--viho-muted)]">{formatDate(rule.valid_from)}</span>
      </Td>
      <Td>
        <span className="text-xs text-[color:var(--viho-muted)]">
          {rule.valid_to ? formatDate(rule.valid_to) : "Sin vencimiento"}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <span
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              isSpecific
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-neutral-200 bg-neutral-100 text-neutral-600",
            ].join(" ")}
          >
            {isSpecific ? "Específica" : "Global"}
          </span>
          {canEdit && onEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 transition hover:bg-purple-100"
            >
              Editar
            </button>
          )}
        </div>
      </Td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Modal de edición de regla de comisión
// ---------------------------------------------------------------------------

function RuleEditModal({
  rule,
  delegateId,
  onClose,
  onSaved,
}: {
  rule: CommissionRule;
  delegateId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [percentage, setPercentage] = useState(String(rule.percentage));
  const [referencePrice, setReferencePrice] = useState(String(rule.reference_price));
  const [fromUnits, setFromUnits] = useState(String(rule.from_units));
  const [toUnits, setToUnits] = useState(String(rule.to_units >= 999999 ? "" : rule.to_units));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;

      const pct = parseFloat(percentage);
      const refPrice = parseFloat(referencePrice);
      const from = parseInt(fromUnits, 10);
      const to = toUnits.trim() === "" ? 999999 : parseInt(toUnits, 10);

      if (isNaN(pct) || isNaN(refPrice) || isNaN(from) || isNaN(to)) {
        setError("Valores numéricos inválidos");
        setSaving(false);
        return;
      }

      const res = await fetch(
        `/api/control-room/delegates/${encodeURIComponent(delegateId)}/commission-rules`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            id: rule.id,
            percentage: pct,
            reference_price: refPrice,
            from_units: from,
            to_units: to,
          }),
        }
      );

      const payload = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? "Error guardando");
        return;
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-[20px] border border-[color:var(--viho-border)] bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-base font-semibold text-[color:var(--viho-primary)]">
            Editar regla de comisión
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[color:var(--viho-muted)] hover:bg-[color:var(--viho-surface-2)]"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <ModalField label="% Comisión" value={percentage} onChange={setPercentage} type="number" placeholder="Ej. 20" />
          <ModalField label="Precio referencia (€)" value={referencePrice} onChange={setReferencePrice} type="number" placeholder="31" />
          <ModalField label="Desde (ud.)" value={fromUnits} onChange={setFromUnits} type="number" placeholder="0" />
          <ModalField label="Hasta (ud., vacío = ∞)" value={toUnits} onChange={setToUnits} type="number" placeholder="999999" />
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-[color:var(--viho-border)] px-4 py-2 text-sm font-semibold text-[color:var(--viho-muted)] hover:bg-[color:var(--viho-surface-2)]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl border border-purple-300 bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({
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
        className="mt-1 w-full rounded-xl border border-[color:var(--viho-border)] bg-white px-3 py-2 text-sm text-[color:var(--viho-primary)] focus:outline-none focus:ring-2 focus:ring-purple-300"
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-[color:var(--viho-primary)]">{value}</div>
    </div>
  );
}

function AccumCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--viho-muted)]">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-[color:var(--viho-primary)]">{value}</div>
      <div className="mt-0.5 text-xs text-[color:var(--viho-muted)]">{sub}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={[
        "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--viho-muted)]",
        align === "right" ? "text-right" : "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <td
      className={[
        "px-4 py-3 text-sm text-[color:var(--viho-primary)]",
        align === "right" ? "text-right" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}
