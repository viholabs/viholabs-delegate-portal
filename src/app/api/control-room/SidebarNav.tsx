"use client";

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

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

function NavLink({ item }: { item: Item }) {
  const pathname = usePathname() || "";
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      className="relative block rounded-xl px-3 py-2 text-sm transition"
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
  );
}

export default function SidebarNav() {
  return (
    <div
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
        <li>
          <NavLink item={DASHBOARD} />
        </li>
      </ul>

      {/* Administración */}
      <details className="mt-3" open>
        <summary
          className="cursor-pointer list-none px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--viho-muted)" }}
        >
          Administración
        </summary>

        <div className="mt-2 space-y-3">
          {ADMIN_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2 text-xs font-semibold" style={{ color: "var(--viho-text)" }}>
                {g.label}
              </div>
              <ul className="mt-1 space-y-1 pl-2">
                {g.items.map((it) => (
                  <li key={it.href}>
                    <NavLink item={it} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      {/* Auditoría */}
      <div className="mt-3 px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--viho-muted)" }}>
        Auditoría
      </div>
      <ul className="mt-1 space-y-1">
        <li>
          <NavLink item={AUDIT} />
        </li>
      </ul>
    </div>
  );
}
