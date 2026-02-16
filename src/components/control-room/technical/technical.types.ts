// src/components/portal/control-room/technical/technical.types.ts

export type TechStatus = "OK" | "DEGRADED" | "CRITICAL";

export type Z0SystemStatusModel = {
  status: TechStatus;
  lastCheckAt?: string; // ISO o text curt ja formatat (decidirem després)
  openIncidentsCount?: number;
  summary?: string;
};

/**
 * Z2 — Pipelines & Ingesta (Model canònic)
 * (No trenca res existent; només amplia contracte)
 */
export type Z2PipelineStatus = TechStatus;

export type Z2ErrorType = "auth" | "schema" | "mapping" | "runtime";

export type Z2PipelineError = {
  type: Z2ErrorType;
  message: string;
};

export type Z2PipelineRow = {
  key: "holded" | "shopify" | "bixgrow" | "commissions";
  label: string;
  status: Z2PipelineStatus;
  last_lot?: string;
  records_affected?: string;
  errors?: Z2PipelineError[];
};

export type Z2PipelinesModel = {
  rows: Z2PipelineRow[];
  updated_at?: string;
};

export type TechnicalTabModel = {
  z0: Z0SystemStatusModel;

  // Reservat per futurs blocs (Z1..Z6).
  // (Quan els formalitzem: afegirem models canònics aquí.)
};
