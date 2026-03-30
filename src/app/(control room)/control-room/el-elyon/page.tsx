import type { ReactNode } from "react";

import ElElyonSystemHealth from "@/components/control-room/el-elyon/ElElyonSystemHealth";
import ElElyonAssignmentsWorkspace from "@/components/control-room/el-elyon/ElElyonAssignmentsWorkspace";
import TechnicalTab from "@/components/control-room/technical/TechnicalTab";

export const dynamic = "force-dynamic";

type SectionShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

function SectionShell({
  eyebrow,
  title,
  description,
  children,
}: SectionShellProps) {
  return (
    <section
      className="overflow-hidden rounded-[28px] border"
      style={{
        borderColor: "var(--viho-border)",
        background: "var(--viho-surface)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="border-b px-5 py-4 md:px-6"
        style={{
          borderColor: "var(--viho-border)",
          background:
            "linear-gradient(180deg, rgba(199,174,106,0.08) 0%, rgba(199,174,106,0.03) 100%)",
        }}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div
              className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--viho-muted)" }}
            >
              {eyebrow}
            </div>

            <h2
              className="text-lg font-semibold leading-tight md:text-[22px]"
              style={{ color: "var(--viho-foreground)" }}
            >
              {title}
            </h2>

            <p
              className="mt-1 max-w-[950px] text-sm leading-6"
              style={{ color: "var(--viho-muted)" }}
            >
              {description}
            </p>
          </div>

          <div className="shrink-0">
            <div
              className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium"
              style={{
                borderColor: "var(--viho-border)",
                color: "var(--viho-muted)",
                background: "rgba(255,255,255,0.55)",
              }}
            >
              Zona confidencial
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 md:px-5 md:py-5">{children}</div>
    </section>
  );
}

function IntroHero() {
  return (
    <section
      className="overflow-hidden rounded-[32px] border"
      style={{
        borderColor: "var(--viho-border)",
        background:
          "radial-gradient(circle at top left, rgba(199,174,106,0.18) 0%, rgba(199,174,106,0.06) 28%, var(--viho-surface) 65%)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.05)",
      }}
    >
      <div className="px-5 py-6 md:px-7 md:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div
              className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em]"
              style={{ color: "var(--viho-muted)" }}
            >
              El-Elyon
            </div>

            <h1
              className="text-2xl font-semibold tracking-tight md:text-3xl"
              style={{ color: "var(--viho-foreground)" }}
            >
              Gobernanza, salud del sistema y asignaciones críticas
            </h1>

            <p
              className="mt-3 max-w-[980px] text-sm leading-6 md:text-[15px]"
              style={{ color: "var(--viho-muted)" }}
            >
              Esta área concentra exclusivamente la información sensible de
              control: salud operativa, diagnóstico técnico y gobierno de
              asignaciones. No se mezcla con el dashboard operativo general.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[440px]">
            <div
              className="rounded-2xl border px-4 py-3"
              style={{
                borderColor: "var(--viho-border)",
                background: "rgba(255,255,255,0.56)",
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--viho-muted)" }}
              >
                Bloque 1
              </div>
              <div
                className="mt-1 text-sm font-semibold"
                style={{ color: "var(--viho-foreground)" }}
              >
                System Health
              </div>
            </div>

            <div
              className="rounded-2xl border px-4 py-3"
              style={{
                borderColor: "var(--viho-border)",
                background: "rgba(255,255,255,0.56)",
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--viho-muted)" }}
              >
                Bloque 2
              </div>
              <div
                className="mt-1 text-sm font-semibold"
                style={{ color: "var(--viho-foreground)" }}
              >
                Technical Control
              </div>
            </div>

            <div
              className="rounded-2xl border px-4 py-3"
              style={{
                borderColor: "var(--viho-border)",
                background: "rgba(255,255,255,0.56)",
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--viho-muted)" }}
              >
                Bloque 3
              </div>
              <div
                className="mt-1 text-sm font-semibold"
                style={{ color: "var(--viho-foreground)" }}
              >
                Assignments Governance
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ElElyonPage() {
  return (
    <main className="w-full">
      <div className="mx-auto flex w-full max-w-[1880px] flex-col gap-5 p-4 md:gap-6 md:p-6">
        <IntroHero />

        <SectionShell
          eyebrow="Bloque 1"
          title="System Health"
          description="Salud global del entorno reservado de El-Elyon. Aquí debe quedar visible si la capa crítica está viva, consistente y preparada para operar."
        >
          <ElElyonSystemHealth />
        </SectionShell>

        <SectionShell
          eyebrow="Bloque 2"
          title="Technical Control"
          description="Vista técnica consolidada para revisar runtime, pipelines, sincronizaciones y señales de estabilidad sin salir de la zona confidencial."
        >
          <TechnicalTab />
        </SectionShell>

        <SectionShell
          eyebrow="Bloque 3"
          title="Assignments Governance"
          description="Espacio central de gobierno para revisar y corregir asignaciones, precedencias y relaciones operativas sensibles con máxima trazabilidad."
        >
          <ElElyonAssignmentsWorkspace />
        </SectionShell>
      </div>
    </main>
  );
}