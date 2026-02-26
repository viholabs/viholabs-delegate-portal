"use client";

/**
 * VIHOLABS — Side Hall (CANÒNIC)
 *
 * Ordre:
 * 1) CommunityHeaderModule (data/hora + temps + rail + títol)
 * 2) IdentityBlock
 * 3) MotivationalBlock
 *
 * IMPORTANT: WeatherModule NO va aquí (ja és dins el Header).
 */

import { useMemo, type ReactNode } from "react";
import CommunityHeaderModule from "./community/CommunityHeaderModule";
import IdentityBlock from "./community/IdentityBlock";
import MotivationalBlock from "./community/MotivationalBlock";

type CommunityModule = {
  id: string;
  render: () => ReactNode;
};

export default function ComunidadViholabs() {
  const modules: CommunityModule[] = useMemo(
    () => [
      { id: "header", render: () => <CommunityHeaderModule /> },
      { id: "identity", render: () => <IdentityBlock /> },
      { id: "motivational", render: () => <MotivationalBlock /> },
    ],
    []
  );

  return (
    <div className="h-full px-4 py-4">
      {modules.map((m) => (
        <div key={m.id}>{m.render()}</div>
      ))}
    </div>
  );
}
