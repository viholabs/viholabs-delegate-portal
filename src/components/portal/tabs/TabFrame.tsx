"use client";

import type { ReactNode } from "react";

/**
 * VIHOLABS — TAB FRAME (CANÓNICO)
 * Ley estructural:
 * - EXACTAMENTE 1 zona dominante
 * - 0–3 zonas secundarias
 * - Zona residual extremadamente ligera
 *
 * Este componente NO define estética.
 * Solo jerarquía cognitiva y geometría perceptiva.
 */

export function TabFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[1400px] space-y-10">
        {children}
      </div>
    </div>
  );
}

/**
 * ZONA DOMINANTE — Centro de gravedad visual
 */
export function TabDominant({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-3">
      {children}
    </section>
  );
}

/**
 * ZONA SECUNDARIA — Complemento cognitivo
 */
export function TabSecondary({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-6">
      {children}
    </section>
  );
}

/**
 * ZONA RESIDUAL — Eventos raros / débiles
 */
export function TabResidual({ children }: { children: ReactNode }) {
  return (
    <section className="opacity-80 space-y-4">
      {children}
    </section>
  );
}
