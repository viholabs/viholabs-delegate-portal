"use client";

import { useEffect, useState } from "react";
import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";

type Liquidation = { id: string; state_code: string | null; amount: number | null };

function fmt(n: number) { return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function LiquidationsModule({ kpis }: { kpis?: { pending: number; total: number } }) {
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function loadData() {
    if (loaded) return;
    setLoading(true);
    fetch("/api/control-room/bixgrow-liquidations", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setLiquidations(d.liquidations ?? []); setLoaded(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const pending = kpis?.pending ?? 0;
  const total = kpis?.total ?? 0;

  const totalPendingAmt = liquidations.filter((l) => l.state_code === "PENDING").reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const totalPaidAmt = liquidations.filter((l) => l.state_code === "PAID").reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const status: ModuleStatus = pending > 0 ? "warning" : total === 0 ? "empty" : "ok";

  return (
    <ElElyonModuleCard
      icon="💰"
      title="Liquidaciones e Informes"
      subtitle="Liquidaciones por actor, delegado, recomendador y comisionista"
      status={status}
      kpis={
        <>
          <KpiChip label="Pendientes" value={pending} warn={pending > 0} />
          <KpiChip label="Total" value={total} />
        </>
      }
    >
      <Subcard title="Liquidaciones BixGrow" defaultOpen>
        <div onClick={loadData} style={{ cursor: loading ? "wait" : "default" }}>
          {!loaded && !loading && (
            <button onClick={loadData} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(0,0,0,0.06)", border: "none", cursor: "pointer" }}>
              Cargar liquidaciones
            </button>
          )}
          {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>Cargando…</div>}
          {loaded && liquidations.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>Sin liquidaciones registradas.</div>}
          {loaded && liquidations.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <span>Pendiente: <strong style={{ color: "#92400e" }}>{fmt(totalPendingAmt)} €</strong></span>
                <span>Pagado: <strong style={{ color: "#065f46" }}>{fmt(totalPaidAmt)} €</strong></span>
              </div>
              {liquidations.slice(0, 10).map((l) => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <span style={{ opacity: 0.7 }}>{l.id.slice(0, 8)}…</span>
                  <span>{l.amount != null ? `${fmt(Number(l.amount))} €` : "—"}</span>
                  <span style={{ fontWeight: 600, color: l.state_code === "PAID" ? "#065f46" : "#92400e" }}>{l.state_code}</span>
                </div>
              ))}
              {liquidations.length > 10 && <div style={{ fontSize: 11, opacity: 0.5 }}>+{liquidations.length - 10} más</div>}
            </div>
          )}
        </div>
      </Subcard>

      <Subcard title="Reglas canónicas de liquidación">
        <div style={{ fontSize: 12, opacity: 0.7, display: "flex", flexDirection: "column", gap: 3 }}>
          <div>· Solo liquidan facturas efectivamente cobradas (is_paid canónico).</div>
          <div>· Solo unidades tipo <strong>sale</strong> entran en base liquidable.</div>
          <div>· CN/abonos nunca liquidan y restan unidades e importes.</div>
          <div>· Promos no liquidan.</div>
          <div>· Comisión recomendador = deducción del delegado responsable.</div>
          <div>· Una factura no puede liquidarse dos veces por el mismo concepto.</div>
          <div>· El actor debe aceptar la propuesta antes de considerarse comisión devengada.</div>
        </div>
      </Subcard>

      <Subcard title="Liquidación delegado: estructura requerida">
        <div style={{ fontSize: 12, opacity: 0.7, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 600 }}>A) Comisión bruta delegado</div>
          <div style={{ paddingLeft: 8 }}>Facturas cobradas × % delegado</div>
          <div style={{ fontWeight: 600 }}>B) Deducciones recomendadores</div>
          <div style={{ paddingLeft: 8 }}>Por factura: recomendador, cliente recomendado, base, %, importe deducido</div>
          <div style={{ fontWeight: 600 }}>C) Comisión neta delegado = A − B</div>
          <div style={{ paddingLeft: 8, fontSize: 11, opacity: 0.7 }}>Implementación completa disponible una vez definidos recomendadores y periodos de liquidación.</div>
        </div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
