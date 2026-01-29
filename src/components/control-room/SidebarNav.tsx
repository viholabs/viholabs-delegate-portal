"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; label: string };

const DASHBOARD: NavItem = { href: "/control-room/dashboard", label: "Dashboard" };

const ADMIN_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  { label: "Importación", items: [{ href: "/control-room/import", label: "Importación" }] },
  {
    label: "Alta / edición",
    items: [
      { href: "/control-room/users", label: "Usuarios" },
      { href: "/control-room/delegates", label: "Delegados" },
      { href: "/control-room/clients", label: "Clientes" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/control-room/commission-rules", label: "Normas de comisiones" },
      { href: "/control-room/roles", label: "Permisos y roles" },
    ],
  },
  { label: "Operativa", items: [{ href: "/control-room/invoices", label: "Facturas" }] },
];

const AUDIT: NavItem = { href: "/control-room/audit", label: "Auditoría" };

function isActiveLink(currentPath: string, href: string) {
  if (!currentPath) return false;
  if (currentPath === href) return true;
  return currentPath.startsWith(href + "/");
}

function todayYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function SmallBadge({ n }: { n: number }) {
  if (!n || n <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full px-2 py-[2px] text-[11px] font-semibold"
      style={{
        background: "rgba(242,132,68,0.14)",
        border: "1px solid rgba(242,132,68,0.35)",
        color: "var(--viho-text)",
      }}
      title={`${n} facturas pendientes de revisión`}
    >
      {n}
    </span>
  );
}

function NavLink({ item, right }: { item: NavItem; right?: React.ReactNode }) {
  const pathname = usePathname() || "";
  const active = isActiveLink(pathname, item.href);

  return (
    <Link
      href={item.href}
      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm transition"
      style={{
        background: active ? "rgba(217,194,186,0.25)" : "transparent",
        border: active ? "1px solid rgba(89,49,60,0.18)" : "1px solid transparent",
        color: "var(--viho-text)",
      }}
    >
      <span className="font-medium">{item.label}</span>

      <span className="flex items-center">
        {right}
        {active ? <span className="ml-2 h-2 w-2 rounded-full" style={{ backgroundColor: "#f28444" }} /> : null}
      </span>
    </Link>
  );
}

export default function SidebarNav() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname() || "";
  const [needsReviewCount, setNeedsReviewCount] = useState<number>(0);

  async function loadCount() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;

      const month = todayYYYYMM();
      const qs = new URLSearchParams();
      qs.set("month", month);
      qs.set("needs_review", "1");
      qs.set("count_only", "1");

      const res = await fetch(`/api/control-room/invoices?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) setNeedsReviewCount(Number(j.count ?? 0) || 0);
    } catch {
      // no rompas el menú
    }
  }

  useEffect(() => {
    loadCount();

    // ✅ refresca al volver a la pestaña
    function onVis() {
      if (document.visibilityState === "visible") loadCount();
    }
    document.addEventListener("visibilitychange", onVis);

    // ✅ refresca cuando alguna pantalla “dice” que se ha guardado
    function onRefresh() {
      loadCount();
    }
    window.addEventListener("viho:needsReviewRefresh", onRefresh);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("viho:needsReviewRefresh", onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ refresca cuando cambias de pantalla (por ejemplo después de guardar y volver)
  useEffect(() => {
    loadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: "rgba(89,49,60,0.12)", background: "rgba(255,255,255,0.65)" }}
    >
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--viho-muted)" }}>
        Navegación
      </div>

      <div className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--viho-muted)" }}>
        Dashboard
      </div>
      <ul className="mt-1 space-y-1">
        <li>
          <NavLink item={DASHBOARD} />
        </li>
      </ul>

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
                {g.items.map((it) => {
                  const isInvoices = it.href === "/control-room/invoices";
                  return (
                    <li key={it.href}>
                      <NavLink item={it} right={isInvoices ? <SmallBadge n={needsReviewCount} /> : null} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </details>

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
