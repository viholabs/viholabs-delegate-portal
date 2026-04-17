"use client";

// src/components/control-room/delegates/detail/TabClientes.tsx
// Clientes del delegado: activos (con actividad en el periodo) e inactivos.
// Cada fila permite navegar a la ficha del cliente en el Control Room.

import Link from "next/link";
import type { DetailClientRow } from "../types";
import { formatMoney, formatDate, formatMonthLabel } from "../utils";

type Props = {
  clients: { active: DetailClientRow[]; inactive: DetailClientRow[] };
  month: string;
};

export default function TabClientes({ clients, month }: Props) {
  const { active, inactive } = clients;

  return (
    <div className="space-y-6">
      {/* Activos */}
      <ClientSection
        title={`Clientes activos — ${formatMonthLabel(month)}`}
        subtitle={`${active.length} clientes con actividad de facturación en el periodo`}
        clients={active}
        isActive
      />

      {/* Inactivos */}
      <ClientSection
        title="Clientes sin actividad"
        subtitle={`${inactive.length} clientes asignados sin facturación en el periodo`}
        clients={inactive}
        isActive={false}
      />
    </div>
  );
}

function ClientSection({
  title,
  subtitle,
  clients,
  isActive,
}: {
  title: string;
  subtitle: string;
  clients: DetailClientRow[];
  isActive: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--viho-border)] bg-white shadow-sm">
      <div className="border-b border-[color:var(--viho-border)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="text-base font-semibold text-[color:var(--viho-primary)]">{title}</div>
          <span
            className={[
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              isActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 bg-neutral-100 text-neutral-600",
            ].join(" ")}
          >
            {clients.length}
          </span>
        </div>
        <div className="mt-0.5 text-sm text-[color:var(--viho-muted)]">{subtitle}</div>
      </div>

      {clients.length === 0 ? (
        <div className="px-5 py-8 text-sm text-[color:var(--viho-muted)]">
          {isActive ? "No hay clientes activos este periodo." : "Todos los clientes tienen actividad."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--viho-border)] bg-[color:var(--viho-surface-2)]">
                <Th>Cliente</Th>
                {isActive ? (
                  <>
                    <Th align="right">Última factura</Th>
                    <Th align="right">Importe último mes</Th>
                    <Th align="right">Ud. vendidas</Th>
                  </>
                ) : (
                  <>
                    <Th align="right">Última factura</Th>
                    <Th align="right">Días sin actividad</Th>
                  </>
                )}
                <Th>Desde</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--viho-border)]">
              {clients.map((client) => (
                <ClientRow key={client.id} client={client} isActive={isActive} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientRow({
  client,
  isActive,
}: {
  client: DetailClientRow;
  isActive: boolean;
}) {
  return (
    <tr className="hover:bg-[color:var(--viho-surface-2)]">
      <Td>
        <span className="font-medium text-[color:var(--viho-primary)]">
          {client.name ?? "—"}
        </span>
      </Td>
      {isActive ? (
        <>
          <Td align="right">{formatDate(client.last_invoice_date)}</Td>
          <Td align="right">{formatMoney(client.last_invoice_gross)}</Td>
          <Td align="right">{client.units_period > 0 ? client.units_period : "—"}</Td>
        </>
      ) : (
        <>
          <Td align="right">{formatDate(client.last_invoice_date)}</Td>
          <Td align="right">
            {client.days_since_activity != null ? (
              <span
                className={
                  client.days_since_activity > 60
                    ? "font-semibold text-red-600"
                    : client.days_since_activity > 30
                    ? "text-amber-600"
                    : "text-[color:var(--viho-primary)]"
                }
              >
                {client.days_since_activity}d
              </span>
            ) : (
              "—"
            )}
          </Td>
        </>
      )}
      <Td>
        <span className="text-xs text-[color:var(--viho-muted)]">
          {formatDate(client.assigned_since)}
        </span>
      </Td>
      <Td>
        <Link
          href={`/control-room/shell?tab=clients&clientId=${encodeURIComponent(client.id)}`}
          className="inline-flex items-center rounded-xl border border-[color:var(--viho-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--viho-primary)] transition hover:bg-[color:var(--viho-surface-2)]"
        >
          Ver ficha
        </Link>
      </Td>
    </tr>
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

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
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
