"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applyBundleBySku } from "./BundleResolver";

type DelegateRow = { id: string; name?: string | null; email?: string | null };
type ClientRow = {
  id: string;
  name?: string | null;
  tax_id?: string | null;
  delegate_id?: string | null;
  holded_contact_id?: string | null;
  delegate_name?: string | null;
  delegate_email?: string | null;
  delegate_valid_from?: string | null;
  delegate_source?: string | null;
};

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

type NewClientForm = {
  name: string;
  tax_id: string;
  phone: string;
  email: string;
  shipping_address: string;
  shipping_postal_code: string;
  shipping_city: string;
  shipping_province: string;
  shipping_country: string;
  equivalence_surcharge: boolean;
  notes: string;
};

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

function normalizeTaxId(raw: string) {
  return safeStr(raw).replace(/\s+/g, "").toUpperCase().trim();
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeStr(v));
}

function isValidSpanishTaxId(raw: string) {
  const value = normalizeTaxId(raw);
  if (!value) return false;

  const dni = /^(\d{8})([A-Z])$/;
  const nie = /^[XYZ]\d{7}[A-Z]$/;
  const cif = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/;

  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";

  const dniMatch = value.match(dni);
  if (dniMatch) {
    const num = Number(dniMatch[1]);
    const letter = dniMatch[2];
    return letters[num % 23] === letter;
  }

  if (nie.test(value)) {
    const first = value[0] === "X" ? "0" : value[0] === "Y" ? "1" : "2";
    const num = Number(`${first}${value.slice(1, 8)}`);
    const letter = value[8];
    return letters[num % 23] === letter;
  }

  if (cif.test(value)) {
    const control = value[value.length - 1];
    const digits = value
      .slice(1, 8)
      .split("")
      .map((n) => Number(n));

    const sumEven = digits
      .filter((_, idx) => idx % 2 === 1)
      .reduce((acc, n) => acc + n, 0);

    const sumOdd = digits
      .filter((_, idx) => idx % 2 === 0)
      .reduce((acc, n) => {
        const doubled = n * 2;
        return acc + Math.floor(doubled / 10) + (doubled % 10);
      }, 0);

    const total = sumEven + sumOdd;
    const unit = (10 - (total % 10)) % 10;
    const controlLetter = "JABCDEFGHI"[unit];
    const firstLetter = value[0];

    const mustBeLetter = /[KPQS]/.test(firstLetter);
    const mustBeDigit = /[ABEH]/.test(firstLetter);

    if (mustBeLetter) return control === controlLetter;
    if (mustBeDigit) return control === String(unit);
    return control === String(unit) || control === controlLetter;
  }

  return false;
}

function emptyNewClientForm(): NewClientForm {
  return {
    name: "",
    tax_id: "",
    phone: "",
    email: "",
    shipping_address: "",
    shipping_postal_code: "",
    shipping_city: "",
    shipping_province: "",
    shipping_country: "España",
    equivalence_surcharge: false,
    notes: "",
  };
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <Card
      style={{
        borderColor: "#e7d8bc",
        boxShadow: "0 1px 2px rgba(90,46,58,0.04)",
      }}
    >
      <CardHeader style={{ paddingBottom: 8 }}>
        <CardTitle
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#8b7355",
            fontWeight: 700,
          }}
        >
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent style={{ paddingTop: 0 }}>
        <div
          style={{
            fontSize: 32,
            lineHeight: 1,
            fontWeight: 700,
            color: "#5a2e3a",
            marginBottom: 8,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#6b5c53",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrdersConsoleTab() {
  const [delegates, setDelegates] = useState<DelegateRow[]>([]);
  const [delegatesLoad, setDelegatesLoad] = useState<"idle" | "loading" | "ok" | "forbidden" | "error">("idle");
  const [selectedDelegateId, setSelectedDelegateId] = useState<string>("");

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoad, setClientsLoad] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [clientQuery, setClientQuery] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [bundlesBySku, setBundlesBySku] = useState<Map<string, BundleDef>>(new Map());
  const [productsLoad, setProductsLoad] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [productQuery, setProductQuery] = useState<string>("");

  const [lines, setLines] = useState<LineDraft[]>([{ sku: "", quantity: 1, unit_price: null }]);

  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [submitMsg, setSubmitMsg] = useState<string>("");

  const [createClientOpen, setCreateClientOpen] = useState<boolean>(false);
  const [createClientState, setCreateClientState] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [createClientMsg, setCreateClientMsg] = useState<string>("");
  const [newClient, setNewClient] = useState<NewClientForm>(emptyNewClientForm());

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
        .map((d: any) => ({
          id: safeStr(d?.id),
          name: d?.name ?? null,
          email: d?.email ?? null,
        }))
        .filter((d: DelegateRow) => !!d.id);

      setDelegates(normalized);
      setDelegatesLoad("ok");
      setSelectedDelegateId((prev) => (normalized.some((d) => d.id === prev) ? prev : ""));
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function reloadClients(preferredClientId?: string) {
    setClientsLoad("loading");
    const q = selectedDelegateId ? `?delegateId=${encodeURIComponent(selectedDelegateId)}` : "";
    const res = await fetchJson(`/api/delegate/clients${q}`);

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
        holded_contact_id: c?.holded_contact_id ?? null,
        delegate_name: c?.delegate_name ?? null,
        delegate_email: c?.delegate_email ?? null,
        delegate_valid_from: c?.delegate_valid_from ?? null,
        delegate_source: c?.delegate_source ?? null,
      }))
      .filter((c: ClientRow) => !!c.id);

    setClients(normalized);
    setClientsLoad("ok");
    setSelectedClientId((prev) => {
      if (preferredClientId && normalized.some((c) => c.id === preferredClientId)) {
        return preferredClientId;
      }
      return normalized.some((c) => c.id === prev) ? prev : "";
    });
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      const q = selectedDelegateId ? `?delegateId=${encodeURIComponent(selectedDelegateId)}` : "";
      setClientsLoad("loading");
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
          holded_contact_id: c?.holded_contact_id ?? null,
          delegate_name: c?.delegate_name ?? null,
          delegate_email: c?.delegate_email ?? null,
          delegate_valid_from: c?.delegate_valid_from ?? null,
          delegate_source: c?.delegate_source ?? null,
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

  const selectedDelegate = useMemo(
    () => delegates.find((d) => d.id === selectedDelegateId) ?? null,
    [delegates, selectedDelegateId]
  );

  const cardsClientsValue =
    !selectedDelegateId && clients.length === 0
      ? "—"
      : clientsLoad === "loading"
        ? "…"
        : clients.length;

  const cardsDelegateValue = selectedDelegate ? safeStr(selectedDelegate.name || selectedDelegate.email || "—") : "General";

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

    const bundleLines = applyBundleBySku(bundlesBySku, sku);
    if (bundleLines && bundleLines.length > 0) {
      setLines(bundleLines.length ? bundleLines : [{ sku, quantity: 1, unit_price: null }]);
      return;
    }

    setLine(lineIndex, { sku, quantity: 1 });
  }

  function setNewClientField<K extends keyof NewClientForm>(key: K, value: NewClientForm[K]) {
    setNewClient((prev) => ({ ...prev, [key]: value }));
  }

  function resetNewClientForm() {
    setNewClient(emptyNewClientForm());
    setCreateClientState("idle");
    setCreateClientMsg("");
  }

  async function submitCreateClient() {
    setCreateClientState("submitting");
    setCreateClientMsg("");

    if (!selectedDelegateId) {
      setCreateClientState("error");
      setCreateClientMsg("Debes seleccionar un delegado antes de crear el cliente.");
      return;
    }

    const payload = {
      delegate_id: selectedDelegateId,
      name: safeStr(newClient.name).trim(),
      tax_id: normalizeTaxId(newClient.tax_id),
      phone: safeStr(newClient.phone).trim(),
      email: safeStr(newClient.email).trim(),
      shipping_address: safeStr(newClient.shipping_address).trim(),
      shipping_postal_code: safeStr(newClient.shipping_postal_code).trim(),
      shipping_city: safeStr(newClient.shipping_city).trim(),
      shipping_province: safeStr(newClient.shipping_province).trim(),
      shipping_country: safeStr(newClient.shipping_country).trim(),
      equivalence_surcharge: !!newClient.equivalence_surcharge,
      notes: safeStr(newClient.notes).trim(),
      vat_percent: 10,
    };

    if (!payload.name) {
      setCreateClientState("error");
      setCreateClientMsg("El nombre es obligatorio.");
      return;
    }

    if (!payload.tax_id) {
      setCreateClientState("error");
      setCreateClientMsg("El NIF/CIF es obligatorio.");
      return;
    }

    if (!isValidSpanishTaxId(payload.tax_id)) {
      setCreateClientState("error");
      setCreateClientMsg("El NIF/CIF no es válido.");
      return;
    }

    if (!payload.phone) {
      setCreateClientState("error");
      setCreateClientMsg("El teléfono es obligatorio.");
      return;
    }

    if (!payload.shipping_address) {
      setCreateClientState("error");
      setCreateClientMsg("El domicilio es obligatorio.");
      return;
    }

    if (!payload.shipping_postal_code) {
      setCreateClientState("error");
      setCreateClientMsg("El código postal es obligatorio.");
      return;
    }

    if (!payload.email) {
      setCreateClientState("error");
      setCreateClientMsg("El email es obligatorio.");
      return;
    }

    if (!isValidEmail(payload.email)) {
      setCreateClientState("error");
      setCreateClientMsg("El email no tiene un formato válido.");
      return;
    }

    try {
      const r = await fetch("/api/delegate/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setCreateClientState("error");
        setCreateClientMsg(safeStr(j?.error || j?.message || `Error ${r.status}`));
        return;
      }

      const createdClientId = safeStr(j?.client?.id || "");
      await reloadClients(createdClientId || undefined);

      if (createdClientId) {
        setSelectedClientId(createdClientId);
      }

      setCreateClientState("ok");
      setCreateClientMsg("Cliente creado correctamente.");
      setCreateClientOpen(false);
      setNewClient(emptyNewClientForm());
    } catch (e: any) {
      setCreateClientState("error");
      setCreateClientMsg(e?.message ?? "Error inesperado");
    }
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
      setSubmitMsg("OK — pedido borrador enviado a Producción.");
    } catch (e: any) {
      setSubmitState("error");
      setSubmitMsg(e?.message ?? "Error inesperado");
    }
  }

  return (
    <div style={{ maxWidth: 1160 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Pedidos</div>
        <div style={{ fontSize: 14, color: "#666" }}>
          Crear pedido borrador en Holded · Selecciona cliente y producto · Packs se auto-rellenan desde BD
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: 18,
        }}
      >
        <StatCard
          title="Delegado"
          value={cardsDelegateValue}
          subtitle={selectedDelegateId ? "Ámbito filtrado por delegado" : "Vista general sin delegado seleccionado"}
        />
        <StatCard
          title="Clientes"
          value={cardsClientsValue}
          subtitle={!selectedDelegateId ? "Selecciona delegado para cargar clientes" : "Clientes operativos del delegado"}
        />
        <StatCard
          title="Productos"
          value={productsLoad === "loading" ? "…" : products.length}
          subtitle="Catálogo disponible para pedidos"
        />
        <StatCard
          title="Líneas"
          value={lines.length}
          subtitle="Líneas actuales del borrador"
        />
      </div>

      <Card
        style={{
          marginBottom: 14,
          borderColor: "#e7d8bc",
          boxShadow: "0 1px 2px rgba(90,46,58,0.04)",
        }}
      >
        <CardHeader style={{ paddingBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <CardTitle style={{ fontSize: 16, color: "#5a2e3a" }}>Delegado</CardTitle>
            <div style={{ fontSize: 12, color: "#7f6d61" }}>
              {delegatesLoad === "loading"
                ? "cargando…"
                : delegatesLoad === "ok"
                  ? `${delegates.length} delegados`
                  : delegatesLoad === "error"
                    ? "error"
                    : "—"}
            </div>
          </div>
        </CardHeader>
        <CardContent style={{ paddingTop: 0 }}>
          <select
            value={selectedDelegateId}
            onChange={(e) => setSelectedDelegateId(e.target.value)}
            disabled={delegatesLoad === "loading" || delegatesLoad === "error"}
            style={{
              width: "100%",
              height: 38,
              borderRadius: 10,
              border: "1px solid #ddd",
              padding: "0 10px",
              background: delegatesLoad === "loading" || delegatesLoad === "error" ? "#f8f8f8" : "#fff",
            }}
          >
            <option value="">— Sin delegado (scope propio) —</option>
            {delegates.map((d) => (
              <option key={d.id} value={d.id}>
                {safeStr(d.name || d.email || d.id)}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 10, fontSize: 12, color: "#6b5c53", lineHeight: 1.45 }}>
            {!selectedDelegateId
              ? "Selecciona un delegado para cargar los clientes asociados. Los productos no dependen del delegado."
              : `Delegado activo: ${safeStr(selectedDelegate?.name || selectedDelegate?.email || "—")}.`}
          </div>
        </CardContent>
      </Card>

      <Card
        style={{
          marginBottom: 14,
          borderColor: "#e7d8bc",
          boxShadow: "0 1px 2px rgba(90,46,58,0.04)",
        }}
      >
        <CardHeader style={{ paddingBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <CardTitle style={{ fontSize: 16, color: "#5a2e3a" }}>Cliente</CardTitle>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  if (createClientOpen) {
                    setCreateClientOpen(false);
                    resetNewClientForm();
                  } else {
                    setCreateClientOpen(true);
                    setCreateClientState("idle");
                    setCreateClientMsg("");
                  }
                }}
                disabled={!selectedDelegateId}
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: !selectedDelegateId ? "#f8f8f8" : "#fff",
                  padding: "0 12px",
                  cursor: !selectedDelegateId ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {createClientOpen ? "Cerrar alta" : "Crear cliente"}
              </button>

              <div style={{ fontSize: 12, color: "#7f6d61" }}>
                {clientsLoad === "loading"
                  ? "cargando…"
                  : clientsLoad === "ok"
                    ? `${clients.length} clientes`
                    : clientsLoad === "error"
                      ? "error"
                      : "—"}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent style={{ paddingTop: 0 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Buscar cliente (nombre o NIF)…"
              style={{
                flex: "1 1 280px",
                height: 38,
                borderRadius: 10,
                border: "1px solid #ddd",
                padding: "0 10px",
                background: !selectedDelegateId ? "#f8f8f8" : "#fff",
              }}
              disabled={!selectedDelegateId}
            />

            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              style={{
                flex: "2 1 420px",
                height: 38,
                borderRadius: 10,
                border: "1px solid #ddd",
                padding: "0 10px",
                background: !selectedDelegateId ? "#f8f8f8" : "#fff",
              }}
              disabled={!selectedDelegateId}
            >
              <option value="">
                {!selectedDelegateId ? "— Elige primero un delegado —" : "— Selecciona un cliente —"}
              </option>
              {filteredClients.slice(0, 200).map((c) => (
                <option key={c.id} value={c.id}>
                  {safeStr(c.name || "—")} {c.tax_id ? `· ${c.tax_id}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#6b5c53", lineHeight: 1.45 }}>
            {!selectedDelegateId
              ? "Como Melquisedec o rol supervisor, primero debes elegir un delegado. Hasta entonces no se listan clientes."
              : clientsLoad === "loading"
                ? "Cargando clientes del delegado seleccionado…"
                : "Listado operativo filtrado por delegado."}
          </div>

          {createClientOpen ? (
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #eee2cf",
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#5a2e3a",
                }}
              >
                Alta de cliente
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                }}
              >
                <input
                  value={newClient.name}
                  onChange={(e) => setNewClientField("name", e.target.value)}
                  placeholder="Nombre *"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <input
                  value={newClient.tax_id}
                  onChange={(e) => setNewClientField("tax_id", e.target.value)}
                  placeholder="NIF/CIF *"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <input
                  value={newClient.phone}
                  onChange={(e) => setNewClientField("phone", e.target.value)}
                  placeholder="Teléfono *"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <input
                  value={newClient.email}
                  onChange={(e) => setNewClientField("email", e.target.value)}
                  placeholder="Email *"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <input
                  value={newClient.shipping_address}
                  onChange={(e) => setNewClientField("shipping_address", e.target.value)}
                  placeholder="Domicilio *"
                  style={{
                    gridColumn: "1 / -1",
                    height: 38,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    padding: "0 10px",
                  }}
                />

                <input
                  value={newClient.shipping_postal_code}
                  onChange={(e) => setNewClientField("shipping_postal_code", e.target.value)}
                  placeholder="Código postal *"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <input
                  value={newClient.shipping_city}
                  onChange={(e) => setNewClientField("shipping_city", e.target.value)}
                  placeholder="Ciudad"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <input
                  value={newClient.shipping_province}
                  onChange={(e) => setNewClientField("shipping_province", e.target.value)}
                  placeholder="Provincia"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <input
                  value={newClient.shipping_country}
                  onChange={(e) => setNewClientField("shipping_country", e.target.value)}
                  placeholder="País"
                  style={{ height: 38, borderRadius: 10, border: "1px solid #ddd", padding: "0 10px" }}
                />

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 38,
                    padding: "0 4px",
                    fontSize: 14,
                    color: "#5a2e3a",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newClient.equivalence_surcharge}
                    onChange={(e) => setNewClientField("equivalence_surcharge", e.target.checked)}
                  />
                  Recargo de equivalencia
                </label>

                <textarea
                  value={newClient.notes}
                  onChange={(e) => setNewClientField("notes", e.target.value)}
                  placeholder="Observaciones"
                  rows={4}
                  style={{
                    gridColumn: "1 / -1",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    padding: "10px 12px",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ fontSize: 12, color: "#6b5c53", lineHeight: 1.45 }}>
                El cliente quedará asignado al delegado seleccionado. IVA por defecto: 10%.
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={submitCreateClient}
                  disabled={createClientState === "submitting" || !selectedDelegateId}
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    padding: "0 14px",
                    cursor: createClientState === "submitting" || !selectedDelegateId ? "not-allowed" : "pointer",
                    fontWeight: 800,
                  }}
                >
                  {createClientState === "submitting" ? "Guardando…" : "Guardar cliente"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreateClientOpen(false);
                    resetNewClientForm();
                  }}
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    padding: "0 14px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Cancelar
                </button>

                {createClientMsg ? (
                  <div style={{ fontSize: 13, color: createClientState === "error" ? "#b00020" : "#166534" }}>
                    {createClientMsg}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card
        style={{
          marginBottom: 14,
          borderColor: "#e7d8bc",
          boxShadow: "0 1px 2px rgba(90,46,58,0.04)",
        }}
      >
        <CardHeader style={{ paddingBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <CardTitle style={{ fontSize: 16, color: "#5a2e3a" }}>Líneas (Producto)</CardTitle>
            <div style={{ fontSize: 12, color: "#7f6d61" }}>
              {productsLoad === "loading"
                ? "cargando…"
                : productsLoad === "ok"
                  ? `Productos: ${products.length}`
                  : productsLoad === "error"
                    ? "error"
                    : "—"}
            </div>
          </div>
        </CardHeader>
        <CardContent style={{ paddingTop: 0 }}>
          <div style={{ marginBottom: 12 }}>
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Buscar producto (nombre o SKU)…"
              style={{
                width: "100%",
                height: 38,
                borderRadius: 10,
                border: "1px solid #ddd",
                padding: "0 10px",
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "#6b5c53" }}>
              Selecciona el producto por nombre. Si eliges un pack, se auto-rellenan las líneas desde BD.
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 1fr) 120px 160px 90px",
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
        </CardContent>
      </Card>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
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
        Nota: el tooltip del selector usa <code>description</code>. Los packs ya la tienen desde BD. El spray la conectaremos a Holded
        en el siguiente paso.
      </div>
    </div>
  );
}