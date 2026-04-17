"use client";

// src/components/control-room/delegates/DelegatesModule.tsx
// Orchestrador del módulo Delegates: gestiona estado, carga de datos y layout general.
// La renderización del listado y los KPIs globales están en DelegatesList.tsx.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DelegatesList, { DelegatesKpiStrip } from "./DelegatesList";
import type { DelegateListRow } from "./types";
import { currentMonth, formatMonthLabel, safeText } from "./utils";

type ApiOk = {
  ok: true;
  actor: { id: string; role: string | null; name: string | null };
  period: { month: string };
  delegates: DelegateListRow[];
};

type ApiFail = { ok: false; stage?: string; error: string };
type ApiResponse = ApiOk | ApiFail;

function isApiOk(payload: ApiResponse | null): payload is ApiOk {
  return payload !== null && payload.ok === true;
}

function getApiError(payload: ApiResponse | null): string {
  if (!payload) return "Respuesta inválida del servidor";
  if (payload.ok === false) return payload.error;
  return "Error desconocido";
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function DelegatesModule() {
  const [month, setMonth] = useState<string>(currentMonth());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string>("—");
  const [delegates, setDelegates] = useState<DelegateListRow[]>([]);

  async function loadData(targetMonth: string) {
    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();

      if (!token) {
        setDelegates([]);
        setActorRole("—");
        setError("Sesión no disponible");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/control-room/delegates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ month: targetMonth }),
      });

      const payload = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !isApiOk(payload)) {
        setDelegates([]);
        setActorRole("—");
        setError(getApiError(payload));
        setLoading(false);
        return;
      }

      setDelegates(Array.isArray(payload.delegates) ? payload.delegates : []);
      setActorRole(safeText(payload.actor?.role, "—"));
      setLoading(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado al cargar delegados";
      setDelegates([]);
      setActorRole("—");
      setError(message);
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const totals = useMemo(() => {
    return delegates.reduce(
      (acc, row) => {
        acc.delegates += 1;
        acc.clients += row.clients_total;
        acc.commissionTotal += row.period.commission_provisional;
        acc.liquidableCount += row.period.liquidable_count;
        acc.liquidableGross += row.period.liquidable_total_gross;
        acc.pendingCount += row.period.pending_count;
        acc.pendingGross += row.period.pending_total_gross;
        acc.overdueCount += row.period.overdue_count;
        acc.overdueGross += row.period.overdue_total_gross;
        return acc;
      },
      {
        delegates: 0,
        clients: 0,
        commissionTotal: 0,
        liquidableCount: 0,
        liquidableGross: 0,
        pendingCount: 0,
        pendingGross: 0,
        overdueCount: 0,
        overdueGross: 0,
      }
    );
  }, [delegates]);

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <section className="rounded-[28px] border border-[color:var(--viho-border)] bg-white px-6 py-6 shadow-[0_10px_30px_rgba(33,24,10,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--viho-primary)]">
              Delegados
            </h1>
            <p className="mt-2 text-sm text-[color:var(--viho-muted)]">
              Alta, seguimiento y visión operativa de la red comercial.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-[190px]">
              <label
                htmlFor="delegates-month"
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--viho-muted)]"
              >
                Periodo
              </label>
              <input
                id="delegates-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--viho-border)] bg-white px-4 py-3 text-sm text-[color:var(--viho-primary)] outline-none"
              />
            </div>

            <div className="min-w-[170px]">
              <div className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--viho-muted)]">
                Rol actual
              </div>
              <div className="rounded-2xl border border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)] px-4 py-3 text-sm font-medium text-[color:var(--viho-primary)]">
                {actorRole}
              </div>
            </div>

            <div className="min-w-[220px]">
              <div className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--viho-muted)]">
                Acción
              </div>
              <Link
                href="/control-room/delegates/new"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-[color:var(--viho-border)] bg-[color:var(--viho-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Crear delegado
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs globales */}
      <DelegatesKpiStrip totals={totals} month={month} />

      {/* Listado */}
      <section className="rounded-[28px] border border-[color:var(--viho-border)] bg-white shadow-[0_10px_30px_rgba(33,24,10,0.05)]">
        <div className="border-b border-[color:var(--viho-border)] px-6 py-4">
          <div className="text-lg font-semibold text-[color:var(--viho-primary)]">
            Red de delegados
          </div>
          <div className="mt-1 text-sm text-[color:var(--viho-muted)]">
            Resumen operativo de {formatMonthLabel(month)}.
          </div>
        </div>

        <DelegatesList
          delegates={delegates}
          loading={loading}
          error={error}
          month={month}
        />
      </section>
    </div>
  );
}
