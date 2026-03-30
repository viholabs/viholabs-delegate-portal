import ExecutiveSummaryBlock from "@/components/control-room/dashboard/ExecutiveSummaryBlock";
import AlertCenterBlock from "@/components/control-room/dashboard/AlertCenterBlock";
import OrdersMonitorBlock from "@/components/control-room/dashboard/OrdersMonitorBlock";
import InvoicesMonitorBlock from "@/components/control-room/dashboard/InvoicesMonitorBlock";
import ClientsMonitorBlock from "@/components/control-room/dashboard/ClientsMonitorBlock";
import ActorsMonitorBlock from "@/components/control-room/dashboard/ActorsMonitorBlock";
import CollectionRiskBlock from "@/components/control-room/dashboard/CollectionRiskBlock";
import ActivityTimelineBlock from "@/components/control-room/dashboard/ActivityTimelineBlock";
import PerformanceOverviewBlock from "@/components/control-room/dashboard/PerformanceOverviewBlock";

import Z2PipelinesLive from "@/components/control-room/technical/blocks/Z2PipelinesLive";

export const dynamic = "force-dynamic";

type SectionShellProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

function SectionShell({
  title,
  children,
  className = "",
}: SectionShellProps) {
  return (
    <section
      className={[
        "rounded-2xl border p-3 md:p-4",
        "bg-[var(--viho-surface)] border-[var(--viho-border)]",
        className,
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--viho-muted)" }}
        >
          {title}
        </h2>
      </div>

      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function ControlRoomDashboardPage() {
  return (
    <main className="w-full">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 p-4 md:gap-5 md:p-6">
        <SectionShell title="Resumen ejecutivo">
          <ExecutiveSummaryBlock />
        </SectionShell>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <SectionShell title="Alert center" className="h-full">
            <AlertCenterBlock />
          </SectionShell>

          <SectionShell title="Pipelines" className="h-full">
            <Z2PipelinesLive />
          </SectionShell>

          <SectionShell title="Performance" className="h-full">
            <PerformanceOverviewBlock />
          </SectionShell>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <SectionShell title="Pedidos" className="h-full">
            <OrdersMonitorBlock />
          </SectionShell>

          <SectionShell title="Facturación" className="h-full">
            <InvoicesMonitorBlock />
          </SectionShell>

          <SectionShell title="Riesgo de cobro" className="h-full">
            <CollectionRiskBlock />
          </SectionShell>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <SectionShell title="Clientes" className="h-full">
            <ClientsMonitorBlock />
          </SectionShell>

          <SectionShell title="Actores" className="h-full">
            <ActorsMonitorBlock />
          </SectionShell>

          <SectionShell title="Actividad" className="h-full">
            <ActivityTimelineBlock />
          </SectionShell>
        </div>
      </div>
    </main>
  );
}