# ADR-0007 — Holded Cutover: Heurística → SKU-pur (2026-02-23)

## Context
El sistema actual conté barreja de heurística històrica i lògica nova. Això és risc crític per escalar a milers de factures/dia.

## Decisió
A partir de 2026-02-23, la identificació de producte és exclusivament per sku (Holded). Sense sku = NEUTRAL a efectes d’unitats/comissions.

## Conseqüències
- El passat (≤ 2026-02-22) es considera Generació 0 i no es reinterpreta.
- Gener 2026 és LOCKED i intocable.
- El nou pipeline (G1) necessita quarantena per sku desconegut i warnings traçables.
