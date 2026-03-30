"use client";

import { useEffect, useState } from "react";
import type { ApiResponse, HoldedInvoiceRow } from "./types";

export function useHoldedDocumentsData(selectedMonth: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HoldedInvoiceRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/control-room/invoices?month=${encodeURIComponent(selectedMonth)}`,
          { cache: "no-store" }
        );

        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load Holded invoices");
        }

        if (!cancelled) {
          setRows(Array.isArray(json.rows) ? json.rows : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  return {
    loading,
    error,
    rows,
    setRows,
    setError,
  };
}