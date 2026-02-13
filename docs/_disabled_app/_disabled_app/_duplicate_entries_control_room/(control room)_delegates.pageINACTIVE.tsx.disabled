"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DelegateRow = { id: string; name: string | null; email: string | null };

type DelegatesApiResponse =
  | {
      ok: true;
      stage?: string;
      actor?: { id: string; role: string | null; name: string | null };
      delegates: DelegateRow[];
    }
  | { ok: false; stage?: string; error: string };

function formatName(d: DelegateRow) {
  return (d.name || "").trim() || (d.email || "").trim() || d.id;
}

export default function ControlRoomDelegatesPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const preselectedId = useMemo(() => sp.get("delegateId") || "", [sp]);

  const [delegates, setDelegates] = useState<DelegateRow[]>([]);
  const [actorRole, setActorRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState(preselectedId);

  async function getTokenOrRedirect(): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent("/control-room/delegates")}`);
      return null;
    }
    return token;
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      // 👇 usamos el endpoint que YA tienes arreglado
      const res = await fetch("/api/control-room/delegates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const json = (await res.json().catch(() => null)) as DelegatesApiResponse | null;

      if (!res.ok || !json || !json.ok) {
        setError((json as any)?.error ?? `Error (${res.status})`);
        setDelegates([]);
        return;
      }

      setActorRole(String(json.actor?.role ?? ""));
      setDelegates(Array.isArray(json.delegates) ? json.delegates : []);
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDelegateDashboard(id: string) {
    router.push(`/delegate/dashboard?delegateId=${encodeURIComponent(id)}`);
  }

  const selected = delegates.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div
            className="text-xs uppercase tracking-widest"
            style={{ color: "rgba(89,49,60,0.7)" }}
          >
            VIHOLABS · CONTROL ROOM
          </div>
          <h1
            className="mt-1 text-3xl font-semibold tracking-tight"
            style={{ color: "#59313c" }}
          >
            Delegados
          </h1>
          <div className="mt-2 text-sm" style={{ color: "rgba(42,29,32,0.7)" }}>
            Selecciona un delegado para abrir su <b>Cuadro de Mando</b> en{" "}
            <Badge variant="warning">modo supervisión</Badge>.
          </div>
          <div className="mt-2 text-xs" style={{ color: "rgba(42,29,32,0.65)" }}>
            Actor (rol): <span className="font-mono">{actorRole || "—"}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Cargando…" : "Actualizar"}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <Card>
          <CardContent className="flex items-start justify-between gap-4">
            <div className="text-sm">{error}</div>
            <Badge variant="danger">ERROR</Badge>
          </CardContent>
        </Card>
      ) : null}

      {/* Selector */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle>Selector de delegado</CardTitle>
          <Badge>Supervisión</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm font-medium" style={{ color: "rgba(42,29,32,0.85)" }}>
            Delegado
          </label>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(89,49,60,0.15)" }}
            >
              <option value="">— Selecciona —</option>
              {delegates.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatName(d)}
                </option>
              ))}
            </select>

            <Button
              onClick={() => selectedId && openDelegateDashboard(selectedId)}
              disabled={!selectedId}
              style={{ backgroundColor: "#59313c" }}
            >
              Abrir Cuadro de Mando
            </Button>
          </div>

          {selected ? (
            <div className="text-xs" style={{ color: "rgba(42,29,32,0.65)" }}>
              Seleccionado:{" "}
              <span className="font-mono">
                {selected.id}
              </span>
              {selected.email ? <> · {selected.email}</> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Tabla (simple, por ahora) */}
      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <div className="mt-1 text-sm" style={{ color: "rgba(42,29,32,0.65)" }}>
            (MVP) Lista de delegados disponible para supervisión.
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {delegates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm" style={{ color: "rgba(42,29,32,0.65)" }}>
                    {loading ? "Cargando…" : "No hay delegados (todavía)."}
                  </TableCell>
                </TableRow>
              ) : (
                delegates.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{formatName(d)}</TableCell>
                    <TableCell>{d.email ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        onClick={() => openDelegateDashboard(d.id)}
                      >
                        Ver dashboard
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
