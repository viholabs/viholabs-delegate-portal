"use client";

import { useSearchParams } from "next/navigation";

import { TabFrame, TabDominant, TabSecondary, TabResidual } from "@/components/portal/tabs/TabFrame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import TechnicalTab from "@/components/control-room/technical/TechnicalTab";

function ShellDemoPage() {
  return (
    <TabFrame>
      <TabDominant>
        <Card>
          <CardHeader>
            <CardTitle>Estado del entorno</CardTitle>
          </CardHeader>
          <CardContent>La situación actual se mantiene estable.</CardContent>
        </Card>
      </TabDominant>

      <TabSecondary>
        <Card>
          <CardHeader>
            <CardTitle>Señales relevantes</CardTitle>
          </CardHeader>
          <CardContent>No se registran variaciones críticas.</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dirección</CardTitle>
          </CardHeader>
          <CardContent>Ritmo operativo dentro de parámetros normales.</CardContent>
        </Card>
      </TabSecondary>

      <TabResidual>
        <Card>
          <CardHeader>
            <CardTitle>Observación</CardTitle>
          </CardHeader>
          <CardContent>Semana sin tensiones destacables.</CardContent>
        </Card>
      </TabResidual>
    </TabFrame>
  );
}

function ShellTechBlockPage() {
  return (
    <TabFrame>
      <TabDominant>
        <TechnicalTab />
      </TabDominant>

      <TabSecondary>
        <Card>
          <CardHeader>
            <CardTitle>Señales relevantes</CardTitle>
          </CardHeader>
          <CardContent>Vista técnica en construcción (bloques Z1..Z6).</CardContent>
        </Card>
      </TabSecondary>

      <TabResidual>
        <Card>
          <CardHeader>
            <CardTitle>Observación</CardTitle>
          </CardHeader>
          <CardContent>Acceso reservado a Melquisedec.</CardContent>
        </Card>
      </TabResidual>
    </TabFrame>
  );
}

export default function ShellPageClient() {
  const sp = useSearchParams();
  const tab = (sp?.get("tab") || "").trim();

  if (tab === "tech_block") return <ShellTechBlockPage />;

  return <ShellDemoPage />;
}
