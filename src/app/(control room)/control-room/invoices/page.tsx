"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DelegateLite = { id: string; name: string | null; email: string | null };

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  client_id: string | null;
  client_name: string | null;
  delegate_id: string | null;
  is_paid: boolean;
  paid_date: string | null;
  total_net: number | null;
  total_gross: number | null;
  source_month: string | null;
  source_provider: string | null;
  source_filename: string | null;
  source_channel?: string | null;
  created_at?: string | null;
};

function fmtEUR(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
  } catch {
    return String(n);
  }
}

function badgePaid(isPaid: boolean) {
  return isPaid ? (
    <Badge className="bg-success text-white">Pagada</Badge>
  ) : (
    <Badge className="bg-muted text-white">No pagada</Badge>
  );
}

function badgeChannel(ch?: string | null) {
  const s = String(ch ?? "").toLowerCase();
  if (s === "online") return <Badge className="bg-info text-white">Online</Badge>;
  if (s === "offline") return <Badge className="bg-warning text-white">Offline</Badge>;
  if (!s || s === "unknown") return <Badge className="bg-muted text-white">—</Badge>;
  return <Badge className="bg-muted text-white">{s}</Badge>;
}

export default function InvoicesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [month, setMonth] = useState<string>("2026-01-01");
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [delegates, setDelegates] = useState<DelegateLite[]>([]);
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  const [draft, setDraft] = useState<
    Record<string, { is_paid: boolean; source_channel: string; delegate_id: string | ""; apply_delegate_to_client: boolean }>
  >({});

  async function getAccessTokenOrThrow() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sin sesión (login requerido)");
    return token;
  }

  async function loadDelegates() {
    const token = await getAccessTokenOrThrow();
    const res = await fetch("/delegates/list", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`No pude cargar delegados (${res.status}): ${t}`);
    }

    const j = await res.json();
    const list: DelegateLite[] = Array.isArray(j?.delegates)
      ? j.delegates.map((d: any) => ({ id: String(d.id), name: d.name ?? null, email: d.email ?? null }))
      : [];
    setDelegates(list);
  }

  async function loadInvoices() {
    setLoading(true);
    setError(null);

    try {
      const token = await getAccessTokenOrThrow();
      const res = await fetch("/api/control-room/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month: month || null, q: q?.trim() ? q.trim() : null }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Error ${res.status}`);

      const list: InvoiceRow[] = Array.isArray(j?.invoices)
        ? j.invoices.map((x: any) => ({
            id: String(x.id),
            invoice_number: String(x.invoice_number ?? "—"),
            invoice_date: x.invoice_date ? String(x.invoice_date) : null,
            client_id: x.client_id ? String(x.client_id) : null,
            client_name: x.client_name ? String(x.client_name) : null,
            delegate_id: x.delegate_id ? String(x.delegate_id) : null,
            is_paid: !!x.is_paid,
            paid_date: x.paid_date ? String(x.paid_date) : null,
            total_net: x.total_net ?? null,
            total_gross: x.total_gross ?? null,
            source_month: x.source_month ? String(x.source_month) : null,
            source_provider: x.source_provider ? String(x.source_provider) : null,
            source_filename: x.source_filename ? String(x.source_filename) : null,
            source_channel: x.source_channel ?? null,
            created_at: x.created_at ?? null,
          }))
        : [];

      setRows(list);

      const d: any = {};
      for (const r of list) {
        d[r.id] = {
          is_paid: !!r.is_paid,
          source_channel: String(r.source_channel ?? "unknown") || "unknown",
          delegate_id: r.delegate_id ? String(r.delegate_id) : "",
          apply_delegate_to_client: false,
        };
      }
      setDraft(d);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando facturas");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow(id: string) {
    setSavingId(id);
    setError(null);

    try {
      const token = await getAccessTokenOrThrow();
      const d = draft[id];
      if (!d) throw new Error("No hay draft para esta factura");

      const res = await fetch("/api/control-room/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          invoice_id: id,
          is_paid: !!d.is_paid,
          source_channel: d.source_channel || "unknown",
          delegate_id: d.delegate_id ? d.delegate_id : null,
          apply_delegate_to_client: !!d.apply_delegate_to_client,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Error ${res.status}`);

      await loadInvoices();
    } catch (e: any) {
      setError(e?.message ?? "Error guardando cambios");
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await loadDelegates();
        await loadInvoices();
      } catch (e: any) {
        setError(e?.message ?? "Error inicializando");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.is_paid).length;
    const unpaid = rows.length - paid;
    const gross = rows.reduce((acc, r) => acc + (Number(r.total_gross) || 0), 0);
    return { paid, unpaid, gross };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Facturas</h1>
        <p className="text-sm text-text-soft">
          Post-import: marca pagada/no pagada, origen (online/offline) y asigna delegado (y opcionalmente al cliente).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-text-soft">Total facturas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{rows.length}</CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-text-soft">Pagadas / No pagadas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {totals.paid} / {totals.unpaid}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-text-soft">Total bruto (suma)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtEUR(totals.gross)}</CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-text-soft">Mes (YYYY-MM-01)</div>
              <input
                className="h-10 w-[180px] rounded-md border px-3"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                placeholder="2026-01-01"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-text-soft">Buscar (nº factura o cliente)</div>
              <input
                className="h-10 w-[320px] rounded-md border px-3"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="F260001 o Ivette"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={loadInvoices} disabled={loading}>
                {loading ? "Cargando..." : "Aplicar"}
              </Button>
              <Button variant="outline" onClick={() => setQ("")} disabled={loading}>
                Limpiar búsqueda
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Listado</CardTitle>
        </CardHeader>

        <CardContent>
          {/* CLAVE: contenedor con scroll horizontal real */}
          <div className="w-full overflow-x-auto">
            {/* CLAVE: min-w grande para que no comprima columnas */}
            <div className="min-w-[1200px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Factura</TableHead>
                    <TableHead className="w-[120px]">Fecha</TableHead>
                    <TableHead className="w-[260px]">Cliente</TableHead>
                    <TableHead className="w-[140px] text-center">Pagada</TableHead>
                    <TableHead className="w-[160px] text-center">Origen</TableHead>
                    <TableHead className="w-[380px]">Delegado</TableHead>
                    <TableHead className="w-[140px] text-right">Bruto</TableHead>
                    <TableHead className="w-[140px] text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((r) => {
                    const d = draft[r.id] || {
                      is_paid: r.is_paid,
                      source_channel: String(r.source_channel ?? "unknown"),
                      delegate_id: r.delegate_id ?? "",
                      apply_delegate_to_client: false,
                    };

                    return (
                      <TableRow key={r.id}>
                        {/* FACTURA: compacta + truncado */}
                        <TableCell className="align-top">
                          <div className="font-medium">{r.invoice_number}</div>
                          <div className="mt-1 max-w-[170px] truncate text-xs text-text-soft" title={r.source_filename ?? ""}>
                            {r.source_filename ?? "—"}
                          </div>
                        </TableCell>

                        <TableCell className="align-top whitespace-nowrap">{r.invoice_date ?? "—"}</TableCell>

                        {/* CLIENTE: truncado + title */}
                        <TableCell className="align-top">
                          <div className="max-w-[250px] truncate" title={r.client_name ?? ""}>
                            {r.client_name ?? "—"}
                          </div>
                          <div className="text-xs text-text-soft">{r.source_provider ?? "—"}</div>
                        </TableCell>

                        <TableCell className="align-top text-center">
                          <div className="mb-2">{badgePaid(!!d.is_paid)}</div>
                          <label className="inline-flex items-center justify-center gap-2 text-xs text-text-soft">
                            <input
                              type="checkbox"
                              checked={!!d.is_paid}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [r.id]: { ...d, is_paid: e.target.checked },
                                }))
                              }
                            />
                            Marcar
                          </label>
                        </TableCell>

                        <TableCell className="align-top text-center">
                          <div className="mb-2 flex justify-center">{badgeChannel(d.source_channel)}</div>
                          <select
                            className="h-9 rounded-md border px-2 text-sm"
                            value={d.source_channel}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [r.id]: { ...d, source_channel: e.target.value },
                              }))
                            }
                          >
                            <option value="unknown">—</option>
                            <option value="online">online</option>
                            <option value="offline">offline</option>
                          </select>
                        </TableCell>

                        <TableCell className="align-top">
                          <select
                            className="h-9 w-[340px] rounded-md border px-2 text-sm"
                            value={d.delegate_id}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [r.id]: { ...d, delegate_id: e.target.value },
                              }))
                            }
                          >
                            <option value="">— Sin delegado —</option>
                            {delegates.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name ?? x.email ?? x.id}
                              </option>
                            ))}
                          </select>

                          <label className="mt-2 inline-flex items-center gap-2 text-xs text-text-soft">
                            <input
                              type="checkbox"
                              checked={!!d.apply_delegate_to_client}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [r.id]: { ...d, apply_delegate_to_client: e.target.checked },
                                }))
                              }
                            />
                            Aplicar al cliente
                          </label>
                        </TableCell>

                        <TableCell className="align-top text-right whitespace-nowrap">{fmtEUR(r.total_gross)}</TableCell>

                        <TableCell className="align-top text-right">
                          <Button onClick={() => saveRow(r.id)} disabled={savingId === r.id || loading}>
                            {savingId === r.id ? "Guardando..." : "Guardar"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-text-soft">
                        No hay facturas con estos filtros.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Tip UX: aviso de scroll */}
          <div className="mt-3 text-xs text-text-soft">
            Tip: si no ves la derecha, desplázate horizontalmente en la tabla.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
