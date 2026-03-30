"use client";

import { useState } from "react";

import type {
  ClientItem,
  EligibleActor,
  RecommenderClientOption,
  EditorAffiliateOption,
} from "./types";

type Props = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  filteredClients: ClientItem[];
  selectedClientId: string;
  selectedClient: ClientItem | null;
  search: string;

  delegateActorId: string;
  recommenderClientId: string;
  affiliateAccountId: string;

  kolActorId: string;
  coordinatorActorId: string;

  commissionist1ActorId: string;
  commissionist2ActorId: string;
  commissionist3ActorId: string;
  commissionist4ActorId: string;
  commissionist5ActorId: string;

  delegates: EligibleActor[];
  recommenders: RecommenderClientOption[];
  affiliates: EditorAffiliateOption[];

  kols: EligibleActor[];
  coordinators: EligibleActor[];
  commissionists: EligibleActor[];

  canEditAffiliate: boolean;

  onSearchChange: (value: string) => void;
  onSelectClient: (clientId: string) => void;

  onDelegateChange: (actorId: string) => void;
  onRecommenderChange: (clientId: string) => void;
  onAffiliateChange: (affiliateAccountId: string) => void;

  onKolChange: (actorId: string) => void;
  onCoordinatorChange: (actorId: string) => void;

  onCommission1Change: (actorId: string) => void;
  onCommission2Change: (actorId: string) => void;
  onCommission3Change: (actorId: string) => void;
  onCommission4Change: (actorId: string) => void;
  onCommission5Change: (actorId: string) => void;
};

export default function ElElyonClientsPanel(props: Props) {
  const {
    filteredClients,
    selectedClient,
    selectedClientId,
    search,
    delegates,
    recommenders,
    affiliates,
    kols,
    coordinators,
    commissionists,
    canEditAffiliate,
  } = props;

  return (
    <div className="space-y-4">

      <input
        className="border p-2 w-full"
        placeholder="Buscar cliente..."
        value={search}
        onChange={(e) => props.onSearchChange(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-6">

        <div className="border rounded p-3 h-[600px] overflow-auto">

          {filteredClients.map((c) => (
            <div
              key={c.id}
              className={`p-2 cursor-pointer ${
                c.id === selectedClientId ? "bg-gray-200" : ""
              }`}
              onClick={() => props.onSelectClient(c.id)}
            >
              {c.name}
            </div>
          ))}

        </div>

        <div className="space-y-3">

          {selectedClient && (
            <>
              <div className="font-bold text-lg">
                {selectedClient.name}
              </div>

              <Selector
                label="Delegate"
                value={props.delegateActorId}
                options={delegates.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""} (${a.email ?? ""})`,
                }))}
                onChange={props.onDelegateChange}
              />

              <Selector
                label="Recommender"
                value={props.recommenderClientId}
                options={recommenders.map((r) => ({
                  id: r.id,
                  label: r.name ?? "",
                }))}
                onChange={props.onRecommenderChange}
              />

              <Selector
                label="Affiliate"
                value={props.affiliateAccountId}
                options={affiliates.map((a) => ({
                  id: a.id,
                  label: a.label,
                }))}
                onChange={props.onAffiliateChange}
                disabled={!canEditAffiliate}
              />

              <Selector
                label="KOL"
                value={props.kolActorId}
                options={kols.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""}`,
                }))}
                onChange={props.onKolChange}
              />

              <Selector
                label="Coordinator"
                value={props.coordinatorActorId}
                options={coordinators.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""}`,
                }))}
                onChange={props.onCoordinatorChange}
              />

              <Selector
                label="Commissionist 1"
                value={props.commissionist1ActorId}
                options={commissionists.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""}`,
                }))}
                onChange={props.onCommission1Change}
              />

              <Selector
                label="Commissionist 2"
                value={props.commissionist2ActorId}
                options={commissionists.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""}`,
                }))}
                onChange={props.onCommission2Change}
              />

              <Selector
                label="Commissionist 3"
                value={props.commissionist3ActorId}
                options={commissionists.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""}`,
                }))}
                onChange={props.onCommission3Change}
              />

              <Selector
                label="Commissionist 4"
                value={props.commissionist4ActorId}
                options={commissionists.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""}`,
                }))}
                onChange={props.onCommission4Change}
              />

              <Selector
                label="Commissionist 5"
                value={props.commissionist5ActorId}
                options={commissionists.map((a) => ({
                  id: a.id,
                  label: `${a.name ?? ""}`,
                }))}
                onChange={props.onCommission5Change}
              />
            </>
          )}

        </div>
      </div>
    </div>
  );
}

function Selector({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">

      <div className="text-sm font-medium">{label}</div>

      <select
        className="border p-2 w-full"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>

        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>

    </div>
  );
}