"use client";

import { useEffect, useMemo, useState } from "react";
import { applyBundleBySku } from "./BundleResolver";

type DelegateRow = { id: string; name?: string | null; email?: string | null };
type ClientRow = { id: string; name?: string | null; tax_id?: string | null; delegate_id?: string | null };

type ProductRow = {
  id?: string | null;
  sku: string;
  name?: string | null;
  description?: string | null;
  is_bundle?: boolean;
};

type BundleItem = { sku: string; quantity: number; unit_price_override: number | null };
type BundleDef = { sku: string; title: string | null; description: string | null; items: BundleItem[] };

type LineDraft = { sku: string; quantity: number; unit_price: number | null };

function safeStr(v: any): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toNum(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchJson(url: string) {
  const r = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function normalizeProducts(payload: any): { products: ProductRow[]; bundles: BundleDef[] } {
  const productsRaw = Array.isArray(payload?.products) ? payload.products : [];
  const bundlesRaw = Array.isArray(payload?.bundles) ? payload.bundles : [];

  const products: ProductRow[] = productsRaw
    .map((p: any) => ({
      id: p?.id ?? null,
      sku: safeStr(p?.sku).trim(),
      name: p?.name ?? null,
      description: p?.description ?? null,
      is_bundle: !!p?.is_bundle,
    }))
    .filter((p: ProductRow) => !!p.sku);

  const bundles: BundleDef[] = bundlesRaw
    .map((b: any) => ({
      sku: safeStr(b?.sku).trim(),
      title: b?.title ?? null,
      description: b?.description ?? null,
      items: Array.isArray(b?.items)
        ? b.items
            .map((it: any) => ({
              sku: safeStr(it?.sku).trim(),
              quantity: Math.max(1, Math.floor(toNum(it?.quantity, 1))),
              unit_price_override: it?.unit_price_override == null ? null : toNum(it?.unit_price_override, 0),
            }))
            .filter((it: any) => !!it.sku)
        : [],
    }))
    .filter((b: BundleDef) => !!b.sku);

  return { products, bundles };
}

export default function OrdersConsoleTab() {
  // Delegados (para roles superiores)
  const [delegates, setDelegates] = useState<DelegateRow[]>([]);
  const [delegatesLoad, setDelegatesLoad] = useState<"idle" | "loading" | "ok" | "forbidden" | "error">("idle");
  const [selectedDelegateId, setSelectedDelegateId] = useState<string>("");

  // Clientes
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoad, setClientsLoad] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [clientQuery, setClientQuery] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Productos + bundles
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [bundlesBySku, setBundlesBySku] = useState<Map<string, BundleDef>>(new Map());
  const [productsLoad, setProductsLoad] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [productQuery, setProductQuery] = useState<string>("");

  // Líneas
  const [lines, setLines] = useState<LineDraft[]>([{ sku: "", quantity: 1, unit_price: null }]);

  // Submit
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [submitMsg, setSubmitMsg] = useState<string>("");

  // 1) Delegados
  useEffect(() => {
    let alive = true;
    (async () => {
      setDelegatesLoad("loading");
      const res = await fetchJson("/api/control-room/delegates");
      if (!alive) return;

      if (!res.ok && (res.status === 401 || res.status === 403)) {
        setDelegatesLoad("forbidden");
        setDelegates([]);
        setSelectedDelegateId("");
        return;
      }
      if (!res.ok) {
        setDelegatesLoad("error");
        setDelegates([]);
        setSelectedDelegateId("");
        return;
      }

      const rows = Array.isArray(res.json?.delegates) ? res.json.delegates : [];
      const normalized: DelegateRow[] = rows
        .map((d: any) => ({ id: safeStr(d?.id), name: d?.name ?? null, email: d?.email ?? null }))
        .filter((d: DelegateRow) => !!d.id);

      setDelegates(normalized);
      setDelegatesLoad("ok");
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 2) Clientes
  useEffect(() => {
    let alive = true;
    (async () => {
      setClientsLoad("loading");
      const q = selectedDelegateId ? `?delegateId=${encodeURIComponent(selectedDelegateId)}` : "";
      const res = await fetchJson(`/api/delegate/clients${q}`);
      if (!alive) return;

      if (!res.ok) {
        setClientsLoad("error");
        setClients([]);
        setSelectedClientId("");
        return;
      }

      const rows =
        (Array.isArray(res.json?.clients) ? res.json.clients : null) ??
        (Array.isArray(res.json?.items) ? res.json.items : []);

      const normalized: ClientRow[] = rows
        .map((c: any) => ({
          id: safeStr(c?.id),
          name: c?.name ?? null,
          tax_id: c?.tax_id ?? null,
          delegate_id: c?.delegate_id ?? null,
        }))
        .filter((c: ClientRow) => !!c.id);

      setClients(normalized);
      setClientsLoad("ok");
      setSelectedClientId((prev) => (normalized.some((c) => c.id === prev) ? prev : ""));
    })();

    return () => {
      alive = false;
    };
  }, [selectedDelegateId]);

  // 3) Productos + bundles
  useEffect(() => {
    let alive = true;
    (async () => {
      setProductsLoad("loading");
      const q = selectedDelegateId ? `?delegateId=${encodeURIComponent(selectedDelegateId)}` : "";
      const res = await fetchJson(`/api/delegate/products${q}`);
      if (!alive) return;

      if (!res.ok) {
        setProductsLoad("error");
        setProducts([]);
        setBundlesBySku(new Map());
        return;
      }

      const { products: normalizedProducts, bundles } = normalizeProducts(res.json);

      const map = new Map<string, BundleDef>();
      for (const b of bundles) map.set(b.sku, b);

      // Orden por nombre (y garantizamos name siempre)
      const withName = normalizedProducts.map((p) => ({
        ...p,
        name: safeStr(p.name).trim() ? p.name : p.sku,
      }));

      withName.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name), "es"));

      setProducts(withName);
      setBundlesBySku(map);
      setProductsLoad("ok");
    })();

    return () => {
      alive = false;
    };
  }, [selectedDelegateId]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const n = safeStr(c.name).toLowerCase();
      const t = safeStr(c.tax_id).toLowerCase();
      return n.includes(q) || t.includes(q);
    });
  }, [clients, clientQuery]);

  const productOptions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const base = products;
    const hits = !q
      ? base
      : base.filter((p) => {
          const sku = safeStr(p.sku).toLowerCase();
          const name = safeStr(p.name).toLowerCase();
          const desc = safeStr(p.description).toLowerCase();
          return sku.includes(q) || name.includes(q) || desc.includes(q);
        });
    return hits.slice(0, 120);
  }, [products, productQuery]);

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { sku: "", quantity: 1, unit_price: null }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function applyProductToLine(lineIndex: number, chosenSku: string) {
    const sku = safeStr(chosenSku).trim();
    if (!sku) {
      setLine(lineIndex, { sku: "", quantity: 1, unit_price: null });
      return;
    }

    // Si es bundle: reemplaza TODAS las líneas por el contenido del bundle
    const bundleLines = applyBundleBySku(bundlesBySku, sku);
    if (bundleLines && bundleLines.length > 0) {
      setLines(bundleLines.length ? bundleLines : [{ sku, quantity: 1, unit_price: null }]);
      return;
    }

    // Producto normal
    setLine(lineIndex, { sku, quantity: 1 });
  }

  async function submitCreateDraft() {
    setSubmitState("submitting");
    setSubmitMsg("");

    const client_id = selectedClientId || null;
    const cleanLines = lines
      .map((l) => ({
        sku: safeStr(l.sku).trim(),
        quantity: Math.max(1, Math.floor(toNum(l.quantity, 1))),
        unit_price: l.unit_price == null || l.unit_price === ("" as any) ? null : toNum(l.unit_price, 0),
      }))
      .filter((l) => l.sku);

    if (!client_id) {
      setSubmitState("error");
      setSubmitMsg("Selecciona un cliente.");
      return;
    }
    if (!cleanLines.length) {
      setSubmitState("error");
      setSubmitMsg("Añade al menos 1 línea.");
      return;
    }

    const body: any = {
      client_id,
      delegate_id: selectedDelegateId ? selectedDelegateId : null,
      items: cleanLines,
    };

    try {
      const r = await fetch("/api/control-room/holded/orders/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSubmitState("error");
        setSubmitMsg(safeStr(j?.error || j?.message || `Error ${r.status}`));
        return;
      }

      setSubmitState("ok");
      setSubmitMsg("OK — pedido borrador enviado a Holded.");
    } catch (e: any) {
      setSubmitState("error");
      setSubmitMsg(e?.message ?? "Error inesperado");
    }
  }

  const fontFamily = `'Montserrat', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;

  return (
    <div style={{ fontFamily, maxWidth: 980 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Pedidos</div>
        <div style={{ fontSize: 13, color: "#666" }}>
          Crear pedido borrador en Holded · Selecciona cliente y producto · Packs se auto-rellenan desde BD
        </div>
      </div>

      {delegatesLoad === "ok" && delegates.length > 0 ? (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Delegado</div>
          <select
            value={selectedDelegateId}
            onChange={(e) => setSelectedDelegateId(e.target.value)}
            style={{ width: "100%", height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
          >
            <option value="">— Sin delegado (scope propio) —</option>
            {delegates.map((d) => (
              <option key={d.id} value={d.id}>
                {safeStr(d.name || d.email || d.id)}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            Al elegir delegado se filtran clientes. Los productos no dependen del delegado.
          </div>
        </div>
      ) : null}

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontWeight: 800 }}>Cliente</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {clientsLoad === "loading"
              ? "cargando…"
              : clientsLoad === "ok"
                ? `${clients.length} clientes`
                : clientsLoad === "error"
                  ? "error"
                  : "—"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <input
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
            placeholder="Buscar cliente (nombre o NIF)…"
            style={{ flex: "1 1 280px", height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
          />

          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            style={{ flex: "2 1 420px", height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
          >
            <option value="">— Selecciona un cliente —</option>
            {filteredClients.slice(0, 200).map((c) => (
              <option key={c.id} value={c.id}>
                {safeStr(c.name || "—")} {c.tax_id ? `· ${c.tax_id}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontWeight: 800 }}>Líneas (Producto)</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {productsLoad === "loading"
              ? "cargando…"
              : productsLoad === "ok"
                ? `Productos: ${products.length}`
                : productsLoad === "error"
                  ? "error"
                  : "—"}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <input
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Buscar producto (nombre o SKU)…"
            style={{ width: "100%", height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            Selecciona el producto por nombre. Si eliges un pack, se auto-rellenan las líneas desde BD.
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {lines.map((l, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 160px 90px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <select
                value={l.sku}
                onChange={(e) => applyProductToLine(i, e.target.value)}
                style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
              >
                <option value="">— Selecciona producto —</option>
                {productOptions.map((p) => (
                  <option key={p.sku} value={p.sku} title={safeStr(p.description)}>
                    {safeStr(p.name || p.sku)} ({p.sku})
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                step={1}
                value={String(l.quantity)}
                onChange={(e) => setLine(i, { quantity: toNum(e.target.value, 1) })}
                style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                placeholder="Qty"
              />

              <input
                type="number"
                step="0.01"
                value={l.unit_price == null ? "" : String(l.unit_price)}
                onChange={(e) => setLine(i, { unit_price: e.target.value === "" ? null : toNum(e.target.value, 0) })}
                style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                placeholder="Precio unit. (opcional)"
              />

              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
                style={{
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: lines.length <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={addLine}
            style={{
              height: 38,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              padding: "0 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            + Añadir línea
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={submitCreateDraft}
          disabled={submitState === "submitting"}
          style={{
            height: 42,
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            padding: "0 16px",
            cursor: submitState === "submitting" ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          {submitState === "submitting" ? "Enviando…" : "Crear borrador en Holded"}
        </button>

        {submitMsg ? (
          <div style={{ fontSize: 13, color: submitState === "error" ? "#b00020" : "#166534" }}>{submitMsg}</div>
        ) : null}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        Nota: el tooltip del selector usa <code>description</code>. Los packs ya la tienen desde BD. El spray la conectaremos a Holded en el siguiente paso.
      </div>
    </div>
  );
}