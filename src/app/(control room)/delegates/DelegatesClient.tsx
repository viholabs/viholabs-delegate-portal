// src/app/(control room)/delegates/DelegatesClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import { CANON_COLORS, CANON_TINTS } from "@/lib/ui-canon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DelegateRow = { id: string; name: string | null; email: string | null };

function formatName(d: DelegateRow) {
  return (d.name || "").trim() || (d.email || "").trim() || d.id;
}

type ApiResponse =
  | { ok: true; actor: { id: string; role: string; name: string | null }; delegates: DelegateRow[] }
  | { ok: false; stage?: string; error: string };

export default function DelegatesClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const preselectedId = useMemo(() => sp.get("delegateId") || "", [sp]);

  const [delegates, setDelegates] = useState<DelegateRow[]>([]);
  const [actorRole, setActorRole] = useState<string>("");

  // Importante: inicializa con el valor del querystring
  const [selectedId, setSelectedId] = useState<string>(preselectedId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const res = await fetch("/api/control-room/delegates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const jsonRes = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !jsonRes || !jsonRes.ok) {
        setError((jsonRes as any)?.error ?? `Error (${res.status})`);
        setDelegates([]);
        setActorRole("");
        return;
      }

      setActorRole(String(jsonRes.actor?.role ?? ""));
      setDelegates(Array.isArray(jsonRes.delegates) ? jsonRes.delegates : []);

      // Si no hay seleccionado, elige el primero
      if (!selectedId && (jsonRes.delegates?.[0]?.id ?? "")) {
        setSelectedId(jsonRes.delegates[0].id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  // Carga inicial
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si cambia el querystring (delegateId) sincroniza selectedId
  useEffect(() => {
    if (preselectedId && preselectedId !== selectedId) setSelectedId(preselectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedId]);

  const selected = delegates.find((d) => d.id === selectedId) ?? null;

  function openDelegateDashboard(id: string) {
    router.push(`/delegate/dashboard?delegateId=${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest" style={{ color: "rgba(89,49,60,0.7)" }}>
            VIHOLABS · CONTROL ROOM
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight" style={{ color: "#59313c" }}>
            Delegados
          </h1>
          <div className="mt-2 text-sm" style={{ color: "rgba(42,29,32,0.7)" }}>
            Selecciona un delegado y abre su <b>Cuadro de Mando</b> en modo supervisión.
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "rgba(42,29,32,0.65)" }}>
            <Badge>Rol: {actorRole || "—"}</Badge>
            <Badge>Modo supervisión</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Cargando…" : "Actualizar"}
          </Button>

          <Button onClick={() => selectedId && openDelegateDashboard(selectedId)} disabled={!selectedId || loading}>
            Abrir Cuadro de Mando
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
          <div>
            <CardTitle>Selector de delegado</CardTitle>
            <div className="mt-1 text-sm" style={{ color: CANON_TINTS.authority.soft }}>
              Lista desde Supabase · orden alfabético
            </div>
          </div>
          <Badge variant="default">{delegates.length} delegados</Badge>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <label className="text-sm font-medium" style={{ color: CANON_COLORS.authority }}>
              Delegado
            </label>

            <select
              value={selectedId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedId(id);

                const q = new URLSearchParams();
                if (id) q.set("delegateId", id);
                router.replace(`/control-room/delegates?${q.toString()}`);
              }}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none md:max-w-[420px]"
              style={{ borderColor: CANON_TINTS.authority.subtle }}
            >
              <option value="">— Selecciona —</option>
              {delegates.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatName(d)}
                </option>
              ))}
            </select>

            <div className="text-xs" style={{ color: CANON_TINTS.authority.soft }}>
              {selected ? (
                <>
                  Seleccionado: <span className="font-semibold">{formatName(selected)}</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>

          <div className="text-xs" style={{ color: CANON_TINTS.authority.soft }}>
            Consejo: para simular con tus delegados, usa esta pantalla y abre el cuadro de mando en modo supervisión.
          </div>
        </CardContent>
      </Card>

      {/* Tabla rápida */}
      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <div className="mt-1 text-sm" style={{ color: CANON_TINTS.authority.soft }}>
            Verificación rápida de nombres y correos.
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
                  <TableCell colSpan={3} className="text-sm" style={{ color: CANON_TINTS.authority.soft }}>
                    {loading ? "Cargando…" : "Sin delegados"}
                  </TableCell>
                </TableRow>
              ) : (
                delegates.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{formatName(d)}</TableCell>
                    <TableCell>{d.email ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" onClick={() => openDelegateDashboard(d.id)}>
                        Abrir
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
