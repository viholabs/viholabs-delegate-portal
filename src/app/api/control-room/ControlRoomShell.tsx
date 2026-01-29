"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string };
type Group = { label: string; items: Item[] };

const DASHBOARD: Item = { label: "Dashboard", href: "/control-room/dashboard" };

const ADMIN_GROUPS: Group[] = [
  {
    label: "Importación",
    items: [{ label: "Importación", href: "/control-room/import" }],
  },
  {
    label: "Alta/edición",
    items: [
      { label: "Usuarios", href: "/control-room/users" },
      { label: "Delegados", href: "/control-room/delegates" },
      { label: "Clientes", href: "/control-room/clients" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { label: "Normas de comisiones", href: "/control-room/commission-rules" },
      { label: "Permisos y Roles", href: "/control-room/roles" },
    ],
  },
  {
    label: "Pedidos",
    items: [
      { label: "Ver/Editar Pedidos", href: "/control-room/orders" },
      { label: "Crear Pedidos", href: "/control-room/orders/new" },
    ],
  },
];

const AUDIT: Item = { label: "Auditoría", href: "/control-room/audit" };

function isActiveLink(currentPath: string, href: string) {
  if (!currentPath) return false;
  if (currentPath === href) return true;
  return currentPath.startsWith(href + "/");
}

function NavLink({ item }: { item: Item }) {
  const currentPath = usePathname() || "";
  const active = isActiveLink(currentPath, item.href);

  return (
    <li>
      <Link
        href={item.href}
        className="group relative block rounded-xl px-3 py-2 text-sm transition"
        style={{
          color: active ? "var(--viho-primary)" : "var(--viho-text)",
          background: active ? "rgba(89, 49, 60, 0.06)" : "transparent",
          boxShadow: active ? "inset 0 0 0 1px rgba(89, 49, 60, 0.18)" : "none",
        }}
      >
        <span
          aria-hidden="true"
          className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-full"
          style={{
            background: "var(--viho-primary)",
            opacity: active ? 1 : 0,
            transition: "opacity 150ms ease",
          }}
        />
        <span className="flex items-center justify-between gap-3">
          <span className="font-medium">{item.label}</span>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--viho-secondary)",
              opacity: active ? 1 : 0,
              transition: "opacity 150ms ease",
            }}
          />
        </span>
      </Link>
    </li>
  );
}

function MenuGroup({ label, items }: { label: string; items: Item[] }) {
  return (
    <div className="mt-3">
      <div className="px-2 text-xs font-semibold" style={{ color: "var(--viho-text)" }}>
        {label}
      </div>
      <ul className="mt-1 space-y-1 pl-2">
        {items.map((it) => (
          <NavLink key={it.href} item={it} />
        ))}
      </ul>
    </div>
  );
}

export default function ControlRoomShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest" style={{ color: "var(--viho-muted)" }}>
                VIHOLABS · CONTROL ROOM
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Portal Super Administrador</h1>
            </div>

            <div className="hidden sm:flex">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs"
                style={{
                  borderColor: "var(--viho-border)",
                  background: "rgba(255,255,255,0.9)",
                  color: "var(--viho-muted)",
                }}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--viho-primary)" }} />
                Operaciones · Facturas · Trazabilidad
              </div>
            </div>
          </div>

          <div className="mt-5 h-px w-full" style={{ background: "rgba(217, 194, 186, 0.55)" }} />
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="col-span-12 md:col-span-3 lg:col-span-2">
            <nav
              className="rounded-2xl border p-3"
              style={{
                borderColor: "var(--viho-border)",
                background: "var(--viho-surface)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--viho-muted)" }}>
                Navegación
              </div>

              {/* Dashboard */}
              <div className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--viho-muted)" }}>
                Dashboard
              </div>
              <ul className="mt-1 space-y-1">
                <NavLink item={DASHBOARD} />
              </ul>

              {/* Administración */}
              <details className="mt-3" open>
                <summary
                  className="cursor-pointer list-none px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--viho-muted)" }}
                >
                  Administración
                </summary>

                <div className="mt-1">
                  {ADMIN_GROUPS.map((g) => (
                    <MenuGroup key={g.label} label={g.label} items={g.items} />
                  ))}
                </div>
              </details>

              {/* Auditoría */}
              <div className="mt-3 px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--viho-muted)" }}>
                Auditoría
              </div>
              <ul className="mt-1 space-y-1">
                <NavLink item={AUDIT} />
              </ul>
            </nav>

            {/* Estado */}
            <div
              className="mt-4 rounded-2xl border p-4"
              style={{
                borderColor: "var(--viho-border)",
                background: "var(--viho-surface)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--viho-muted)" }}>
                Estado
              </div>

              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--viho-secondary)" }} />
                <span style={{ color: "var(--viho-text)" }}>Tema corporativo activo</span>
              </div>

              <div className="mt-2 text-sm" style={{ color: "var(--viho-muted)" }}>
                UI lista. Siguiente paso: KPIs y tablas con datos reales.
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="col-span-12 md:col-span-9 lg:col-span-10">{children}</main>
        </div>

        <footer className="mt-8 pb-6 text-center text-xs" style={{ color: "var(--viho-muted)" }}>
          Viholabs Delegate Portal · Control Room
        </footer>
      </div>
    </div>
  );
}
