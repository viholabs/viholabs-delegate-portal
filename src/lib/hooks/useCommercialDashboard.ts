"use client";

import { useEffect, useState } from "react";
import type { DashboardCommercial } from "@/lib/crm/schemas";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

export function useCommercialDashboard(month: string) {
  const [data, setData] = useState<DashboardCommercial | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!month) return;

    setLoading(true);
    setError(null);

    fetchWithAuth(`/api/delegate/commercial?month=${encodeURIComponent(month)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Error (${res.status}) cargando dashboard comercial`);
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => setError(err?.message ?? "Error inesperado"))
      .finally(() => setLoading(false));
  }, [month]);

  return { data, loading, error };
}
