"use client";

/**
 * VIHOLABS — TechnicalTab
 *
 * Regla:
 * - TechnicalTab es contenido interno de El-Elyon.
 * - No es una top tab independiente.
 * - Debe respetar estrictamente los tipos de technical.types.ts.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import Z0SystemStatus from "./blocks/Z0SystemStatus";
import Z1SubsystemsLive from "./blocks/Z1SubsystemsLive";
import Z2PipelinesLive from "./blocks/Z2PipelinesLive";
import Z2_3HoldedSyncStatus from "./blocks/Z2_3HoldedSyncStatus";
import Z3ViholetaStatusLive from "./blocks/Z3ViholetaStatusLive";

export default function TechnicalTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bloc Tècnic</CardTitle>
        </CardHeader>
        <CardContent
          className="text-sm"
          style={{ color: "var(--viho-muted)" }}
        >
          Consola técnica de gobierno y observación del sistema dentro de
          El-Elyon. Recursos y El-Elyon permanecen separados en el Shell
          canónico.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Z1SubsystemsLive />
        <Z2_3HoldedSyncStatus />
        <Z2PipelinesLive />
        <Z3ViholetaStatusLive />
      </div>

      <Z0SystemStatus
        model={{
          status: "OK",
        }}
      />
    </div>
  );
}