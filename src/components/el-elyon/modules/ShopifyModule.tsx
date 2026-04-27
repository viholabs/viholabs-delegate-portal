"use client";

import ElElyonModuleCard, { KpiChip, Subcard, type ModuleStatus } from "../ElElyonModuleCard";

export default function ShopifyModule({ shopifyConfigured }: { shopifyConfigured?: boolean }) {
  const configured = shopifyConfigured ?? false;
  const status: ModuleStatus = configured ? "ok" : "empty";

  return (
    <ElElyonModuleCard
      icon="🛍️"
      title="Shopify Control"
      subtitle="Ventas Shopify · Atribución a actores/recomendadores · Conciliación Holded"
      status={status}
      kpis={
        <>
          <KpiChip label="Estado" value={configured ? "Conectado" : "No configurado"} warn={!configured} />
          {!configured && <KpiChip label="Pedidos" value="—" />}
        </>
      }
    >
      <Subcard title="Estado de la integración" defaultOpen>
        {!configured ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              La integración con Shopify no está configurada. Para activarla, añade las siguientes variables de entorno al servidor:
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11, background: "rgba(0,0,0,0.05)", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span>SHOPIFY_STORE_DOMAIN=tu-tienda.myshopify.com</span>
              <span>SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxx</span>
              <span>SHOPIFY_API_VERSION=2024-01</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              Una vez configurada, este módulo mostrará: pedidos Shopify, matching con clientes Viholabs, atribución a afiliados/recomendadores/delegados y conciliación con facturas Holded.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#065f46" }}>Shopify conectado. Cargando datos…</div>
        )}
      </Subcard>

      <Subcard title="Shopify → Matching clientes">
        <div style={{ fontSize: 12, opacity: 0.7 }}>Match por email, teléfono o manual. Disponible cuando Shopify esté configurado.</div>
      </Subcard>

      <Subcard title="Shopify → Atribución comercial">
        <div style={{ fontSize: 12, opacity: 0.7 }}>Vinculación de pedidos a afiliados BixGrow, recomendadores y delegados. Disponible cuando Shopify esté configurado.</div>
      </Subcard>

      <Subcard title="Shopify → Facturas Holded">
        <div style={{ fontSize: 12, opacity: 0.7 }}>Conciliación pedido ↔ factura por email, importe y fecha. Disponible cuando Shopify esté configurado.</div>
      </Subcard>
    </ElElyonModuleCard>
  );
}
