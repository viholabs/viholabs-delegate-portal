# VIHOLABS — Holded Cutover: Heurística → SKU (2026-02-23)

Data efectiva: 2026-02-23 (Europe/Madrid)

## 1) Principi suprem
- No heurístiques per identificar producte en el futur.
- Importació idempotent i determinista.
- Traçabilitat completa Holded ↔ Supabase.
- Governança temporal estricta: LOCKED intocable.

## 2) Governança temporal
### 2.1 Mesos LOCKED
- 2026-01 (Gener 2026) = LOCKED (història canònica, intocable).
- Qualsevol intent d’escriptura (create/update/delete) sobre documents d’aquest mes és INCIDENT CRÍTIC.

### 2.2 Doble generació de dades (no es migra històric ara)
- Generació 0 (G0): imports fins 2026-02-22 (inclòs).
  - Pot contenir heurístiques històriques (parsing text/neutral detection antic).
  - No es reinterpreta; només correccions internes molt puntuals sota governança (i mai sobre LOCKED).

- Generació 1 (G1): imports des de 2026-02-23 (inclòs).
  - Model SKU-pur (sense heurístiques per producte).

## 3) Regla canònica nova (G1): Producte = SKU
- Una línia és "producte operatiu" només si té sku (Holded) no buit.
- Si sku és null/buit/whitespace:
  - la línia és NEUTRAL a efectes d’unitats/comissions/KPI.
  - unitats = 0 (sempre).
  - econòmicament pot existir, però no participa en unitats ni comissions.

- Si sku existeix però no és al catàleg VIHOLABS:
  - la línia entra en estat de QUARANTENA / NEEDS_CATALOG
  - no computa unitats/comissions fins que el catàleg la reconegui.

## 4) Identitat canònica Holded ↔ Supabase (invariant)
Factura:
- invoices.id = UUID intern (Supabase)
- invoices.external_source = 'HOLDED'
- invoices.external_invoice_id = Holded invoice.id (únic)
- invoices.invoice_number = Holded docNumber (per humans)

Línies:
- S’han de poder reescriure determinísticament en reimports (idempotència).

## 5) Incidents i visibilitat (Bloc Tècnic)
- "Governança temporal": qualsevol escrit sobre LOCKED → incident crític.
- "Holded Ingest": errors d’import, warnings/quarantena, i idempotència.
- Prohibit qualsevol correcció silenciosa: tot canvi ha de quedar traçat.
